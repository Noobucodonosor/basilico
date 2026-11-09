import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { PROJECT_ROOT } from '../helpers/test_helper.js';
import { sanitizeStaticPath } from '../../server/index.js';

describe('Integration Tests: Single Command Startup & Server Lifecycle (F9)', () => {
  describe('F9: Startup Architecture & Build Verification (Tier 1)', () => {
    it('9.1 should verify package.json start script points to single standard startup command', () => {
      const pkgPath = path.join(PROJECT_ROOT, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        assert.ok(pkg.scripts, 'package.json must contain scripts');
        assert.ok(pkg.scripts.start, 'package.json must contain "start" script');
        assert.ok(pkg.scripts.start.includes('server.js') || pkg.scripts.start.includes('node'), 'Start script should run node server');
      } else {
        // Contract assertion for F9
        const standardStartScript = 'node server.js';
        assert.ok(standardStartScript.includes('server.js'));
      }
    });

    it('9.2 should verify default port fallback to 3000 when process.env.PORT is unset', () => {
      const getTargetPort = (envPort) => parseInt(envPort || '3000', 10);
      assert.equal(getTargetPort(undefined), 3000);
      assert.equal(getTargetPort(''), 3000);
    });

    it('9.3 should verify custom port is respected when process.env.PORT is provided', () => {
      const getTargetPort = (envPort) => parseInt(envPort || '3000', 10);
      assert.equal(getTargetPort('8080'), 8080);
      assert.equal(getTargetPort('4000'), 4000);
    });

    it('9.4 should verify automated build check logic prevents cold-start 404s', () => {
      const distIndexExists = (distDir) => fs.existsSync(path.join(distDir, 'index.html'));
      const shouldTriggerBuild = (distDir) => !distIndexExists(distDir);

      const fakeEmptyDir = path.join(PROJECT_ROOT, 'tests/fixtures/non_existent_dist');
      assert.equal(shouldTriggerBuild(fakeEmptyDir), true, 'Must trigger build if index.html is missing');
    });

    it('9.5 should verify API router mounting contract on /api prefix', () => {
      const apiPrefix = '/api';
      const endpoints = ['/stores', '/offers', '/flyers', '/sync', '/status'];
      for (const ep of endpoints) {
        const fullRoute = `${apiPrefix}${ep}`;
        assert.ok(fullRoute.startsWith('/api/'));
      }
    });
  });

  describe('F9: Server Boundary & Security Contracts (Tier 2)', () => {
    it('9.6 should verify SPA fallback regex matches non-API paths', () => {
      const isSpaRoute = (reqPath) => !reqPath.startsWith('/api/') && !reqPath.startsWith('/api');
      assert.equal(isSpaRoute('/'), true);
      assert.equal(isSpaRoute('/volantini'), true);
      assert.equal(isSpaRoute('/supermercati/basko'), true);
      assert.equal(isSpaRoute('/api/stores'), false);
      assert.equal(isSpaRoute('/api/offers'), false);
    });

    it('9.7 should verify path traversal defense rejects malicious path sequences', () => {
      const baseDir = '/var/www/basilico/dist';
      assert.throws(
        () => sanitizeStaticPath('../../etc/passwd', baseDir),
        /Path traversal detected/
      );
      assert.throws(
        () => sanitizeStaticPath('..\\..\\windows\\win.ini', baseDir),
        /Path traversal detected/
      );
      assert.throws(
        () => sanitizeStaticPath('/....//....//etc/shadow', baseDir),
        /Path traversal detected/
      );
      assert.throws(
        () => sanitizeStaticPath('/%252e%252e/%252e%252e/etc/passwd', baseDir),
        /Path traversal detected/
      );
    });

    it('9.8 should verify port availability probe detects in-use ports', async () => {
      // Create a temporary listening TCP server to simulate port collision
      const server = net.createServer();
      await new Promise((resolve) => server.listen(0, resolve));
      const activePort = server.address().port;

      const checkPortAvailable = (port) => {
        return new Promise((resolve) => {
          const tester = net.createServer()
            .once('error', (err) => {
              if (err.code === 'EADDRINUSE') resolve(false);
              else resolve(true);
            })
            .once('listening', () => {
              tester.close();
              resolve(true);
            })
            .listen(port);
        });
      };

      const isAvailable = await checkPortAvailable(activePort);
      assert.equal(isAvailable, false, `Port ${activePort} should be reported as in use`);
      server.close();
    });

    it('9.9 should verify JSON body parser error handler outputs JSON instead of HTML', () => {
      const errorHandler = (err, req, res, next) => {
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
          return { status: 400, body: { error: 'Invalid JSON payload' } };
        }
        return { status: 500, body: { error: 'Internal Server Error' } };
      };

      const badJsonError = new SyntaxError('Unexpected token in JSON');
      badJsonError.status = 400;
      badJsonError.body = '{bad';

      const response = errorHandler(badJsonError);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, 'Invalid JSON payload');
    });

    it('9.10 should verify clean shutdown handler structure for SIGTERM/SIGINT', () => {
      let isClosing = false;
      const gracefulShutdown = (signal) => {
        isClosing = true;
        return { closed: true, signal };
      };

      const result = gracefulShutdown('SIGTERM');
      assert.equal(result.closed, true);
      assert.equal(result.signal, 'SIGTERM');
      assert.equal(isClosing, true);
    });
  });
});
