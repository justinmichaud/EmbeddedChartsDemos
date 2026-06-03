import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()

    // Maximize to the screen's visible frame so the chart render area matches
    // the other demos — a smaller default window renders fewer chart pixels and
    // the FPS/memory numbers wouldn't be comparable.
    if let screen = self.screen ?? NSScreen.main {
      self.setFrame(screen.visibleFrame, display: true)
    }
  }
}
