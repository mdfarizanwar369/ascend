import Capacitor

class AscendViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleBillingPlugin())
        bridge?.registerPluginInstance(AscendVoicePlugin())
        bridge?.registerPluginInstance(AscendSiriPlugin())
        bridge?.registerPluginInstance(AscendHealthPlugin())
    }
}
