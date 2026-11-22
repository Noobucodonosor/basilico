import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: vision_ocr.swift <image_path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
guard let nsImage = NSImage(contentsOfFile: imagePath),
      let baseCg = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Failed to load image: \(imagePath)\n", stderr)
    exit(1)
}

// Upscale small flyer cutouts (2.5x) so small weights like "1 kg" or "110 g" are recognized accurately
let scale: Int = baseCg.width < 800 ? 3 : 1
var targetCg = baseCg
if scale > 1 {
    let w = baseCg.width * scale
    let h = baseCg.height * scale
    if let ctx = CGContext(
        data: nil,
        width: w,
        height: h,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) {
        ctx.interpolationQuality = .high
        ctx.draw(baseCg, in: CGRect(x: 0, y: 0, width: w, height: h))
        if let upscaled = ctx.makeImage() {
            targetCg = upscaled
        }
    }
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["it-IT", "en-US"]
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: targetCg, options: [:])
try handler.perform([request])

let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
