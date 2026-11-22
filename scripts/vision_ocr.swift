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

let scale: Int = baseCg.width < 900 ? 3 : 1
var upscaledCg = baseCg
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
        if let res = ctx.makeImage() {
            upscaledCg = res
        }
    }
}

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.recognitionLanguages = ["it-IT", "en-US"]
req.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: upscaledCg, options: [:])
try handler.perform([req])

let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
