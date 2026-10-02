import AVFoundation
import Capacitor
import Speech

@objc(AscendVoicePlugin)
public class AscendVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AscendVoicePlugin"
    public let jsName = "AscendVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise)
    ]

    private let audioEngine = AVAudioEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var listeningCall: CAPPluginCall?
    private var lastTranscript = ""
    private var timeout: Timer?
    private var tapInstalled = false

    @objc func isAvailable(_ call: CAPPluginCall) {
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        call.resolve([
            "available": recognizer?.isAvailable == true && recognizer?.supportsOnDeviceRecognition == true,
            "naturalAudioAvailable": true
        ])
    }

    @objc func listen(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.listeningCall == nil else { call.reject("Already listening"); return }
            let locale = Locale(identifier: call.getString("locale") ?? "en-US")
            let recognizer = SFSpeechRecognizer(locale: locale)
            guard recognizer?.isAvailable == true, recognizer?.supportsOnDeviceRecognition == true else {
                call.reject("On-device speech recognition is unavailable for this language. Try English.")
                return
            }
            SFSpeechRecognizer.requestAuthorization { status in
                guard status == .authorized else { call.reject("Allow Speech Recognition in iPhone Settings to use Ascend Voice."); return }
                AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                    guard allowed else { call.reject("Allow microphone access in iPhone Settings to use Ascend Voice."); return }
                    DispatchQueue.main.async { self.beginListening(call, recognizer: recognizer!) }
                }
            }
        }
    }

    private func beginListening(_ call: CAPPluginCall, recognizer: SFSpeechRecognizer) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.requiresOnDeviceRecognition = true
            request.shouldReportPartialResults = true
            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            tapInstalled = true
            audioEngine.prepare()
            try audioEngine.start()
            listeningCall = call
            recognitionRequest = request
            lastTranscript = ""
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self, self.listeningCall != nil else { return }
                    if let result {
                        self.lastTranscript = result.bestTranscription.formattedString
                        if result.isFinal { self.finishListening() }
                    } else if let error {
                        self.failListening(error.localizedDescription)
                    }
                }
            }
            timeout = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
                DispatchQueue.main.async { self?.finishListening() }
            }
        } catch {
            cleanupListening()
            call.reject("Could not start the microphone. Please try again.")
        }
    }

    private func cleanupListening() {
        timeout?.invalidate()
        timeout = nil
        if audioEngine.isRunning { audioEngine.stop() }
        if tapInstalled { audioEngine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func finishListening() {
        guard let call = listeningCall else { return }
        listeningCall = nil
        let transcript = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        cleanupListening()
        if transcript.isEmpty { call.reject("I didn't hear a question. Please try again.") }
        else { call.resolve(["transcript": transcript]) }
    }

    private func failListening(_ message: String) {
        guard let call = listeningCall else { return }
        listeningCall = nil
        cleanupListening()
        call.reject(message)
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.listeningCall?.reject("Listening cancelled")
            self.listeningCall = nil
            self.cleanupListening()
            call.resolve()
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let text = call.getString("text"), !text.isEmpty else { call.reject("Missing text"); return }
            self.synthesizer.stopSpeaking(at: .immediate)
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            utterance.rate = 0.5
            self.synthesizer.speak(utterance)
            call.resolve()
        }
    }

    @objc func playAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let encoded = call.getString("audioBase64"),
                  let data = Data(base64Encoded: encoded),
                  data.count >= 44, data.count <= 2_000_000,
                  data.starts(with: Data("RIFF".utf8)) else {
                call.reject("The natural voice audio could not be played.")
                return
            }
            do {
                self.synthesizer.stopSpeaking(at: .immediate)
                self.audioPlayer?.stop()
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try AVAudioSession.sharedInstance().setActive(true)
                let player = try AVAudioPlayer(data: data)
                player.prepareToPlay()
                guard player.play() else { call.reject("The natural voice audio could not be played."); return }
                self.audioPlayer = player
                call.resolve()
            } catch {
                call.reject("The natural voice audio could not be played.")
            }
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.synthesizer.stopSpeaking(at: .immediate)
            self?.audioPlayer?.stop()
            self?.audioPlayer = nil
            call.resolve()
        }
    }
}
