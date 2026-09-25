import Capacitor

class AscendViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleBillingPlugin())
    }
}
