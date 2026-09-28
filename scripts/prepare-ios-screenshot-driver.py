"""Install a simulator-only UI capture helper in the disposable CI checkout.

This file is called only by ios-screenshots.yml. Release builds do not run it.
The helper uses the existing form controls and never changes app content.
"""
from pathlib import Path
import sys

path = Path('ios/App/App/AppDelegate.swift')
source = path.read_text()
source = source.replace('import Capacitor', 'import Capacitor\nimport WebKit', 1)
source = source.replace('    var window: UIWindow?', '''    var window: UIWindow?
#if DEBUG && targetEnvironment(simulator)
    private var screenshotTimer: Timer?
#endif''', 1)
needle = '    func applicationDidBecomeActive(_ application: UIApplication) {'
assert needle in source
source = source.replace(needle, needle + '''
#if DEBUG && targetEnvironment(simulator)
        startScreenshotDriver()
#endif''', 1)
source += '''
#if DEBUG && targetEnvironment(simulator)
extension AppDelegate {
    func startScreenshotDriver() {
        guard screenshotTimer == nil,
              let scriptURL = Bundle.main.url(forResource: "capture-login", withExtension: "js"),
              let script = try? String(contentsOf: scriptURL, encoding: .utf8) else { return }
        screenshotTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            guard let self = self,
                  let controller = self.window?.rootViewController as? CAPBridgeViewController,
                  let webView = controller.webView else { return }
            webView.evaluateJavaScript(script) { result, error in
                guard let status = result as? String else { return }
                let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                try? status.write(to: documents.appendingPathComponent("capture-status.txt"), atomically: true, encoding: .utf8)
                if status == "READY" {
                    timer.invalidate()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                        try? "READY".write(to: documents.appendingPathComponent("capture-ready.txt"), atomically: true, encoding: .utf8)
                    }
                }
            }
        }
    }
}
#endif
'''
path.write_text(source)
if '--listing' in sys.argv:
    # Commands are installed in this disposable simulator's Documents directory.
    # They interact with real controls; no app data or responses are substituted.
    source = source.replace('webView.evaluateJavaScript(script) { result, error in', '''let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            if let data = try? Data(contentsOf: documents.appendingPathComponent("listing-command.json")),
               let command = try? JSONSerialization.jsonObject(with: data) as? [String: String],
               let code = command["script"], let identifier = command["id"] {
                webView.evaluateJavaScript(code) { result, error in
                    let status = result as? String ?? "Waiting for page"
                    let value = ["id": identifier, "status": status]
                    if let encoded = try? JSONSerialization.data(withJSONObject: value) {
                        try? encoded.write(to: documents.appendingPathComponent("listing-status.json"), options: .atomic)
                    }
                }
                return
            }
            webView.evaluateJavaScript(script) { result, error in''')
    source = source.replace('                    timer.invalidate()', '                    // Keep polling for the next listing capture command.')
    path.write_text(source)
print('Simulator-only screenshot helper prepared; release sources remain unchanged in git.')
