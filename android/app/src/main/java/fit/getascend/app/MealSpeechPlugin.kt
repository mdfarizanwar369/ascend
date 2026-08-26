package fit.getascend.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.Locale

@CapacitorPlugin(
    name = "MealSpeech",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class MealSpeechPlugin : Plugin(), RecognitionListener {
    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingCall: PluginCall? = null
    private var cancelledByClient = false

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        bridge.executeOnMainThread {
            call.resolve(
                JSObject().apply {
                    put("available", SpeechRecognizer.isRecognitionAvailable(context))
                    put("permissionGranted", getPermissionState("microphone") == PermissionState.GRANTED)
                }
            )
        }
    }

    @PluginMethod
    fun startListening(call: PluginCall) {
        if (pendingCall != null) {
            call.reject("The microphone is already listening.", "busy")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            call.reject("Speech recognition is not available on this device.", "unavailable")
            return
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
            return
        }
        beginListening(call)
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission was not granted.", "permission_denied")
            return
        }
        beginListening(call)
    }

    private fun beginListening(call: PluginCall) {
        bridge.executeOnMainThread {
            if (pendingCall != null) {
                call.reject("The microphone is already listening.", "busy")
                return@executeOnMainThread
            }

            cancelledByClient = false
            pendingCall = call
            releaseRecognizer()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).also {
                it.setRecognitionListener(this)
            }

            val locale = call.getString("locale")?.trim().takeUnless { it.isNullOrBlank() }
                ?: Locale.getDefault().toLanguageTag()
            val prompt = call.getString("prompt")?.trim().takeUnless { it.isNullOrBlank() }
                ?: "Describe what you ate"
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            }

            try {
                speechRecognizer?.startListening(intent)
            } catch (error: Exception) {
                rejectPending("Voice entry could not start.", "recognition_failed", error)
            }
        }
    }

    @PluginMethod
    fun stopListening(call: PluginCall) {
        bridge.executeOnMainThread {
            if (pendingCall == null) {
                call.resolve(JSObject().put("stopped", false))
                return@executeOnMainThread
            }
            speechRecognizer?.stopListening()
            call.resolve(JSObject().put("stopped", true))
        }
    }

    @PluginMethod
    fun cancelListening(call: PluginCall) {
        bridge.executeOnMainThread {
            val wasListening = pendingCall != null
            cancelledByClient = true
            speechRecognizer?.cancel()
            rejectPending("Listening was cancelled.", "cancelled")
            call.resolve(JSObject().put("cancelled", wasListening))
        }
    }

    override fun onResults(results: Bundle?) {
        val alternatives = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.map { it.trim() }
            ?.filter { it.isNotBlank() }
            .orEmpty()
        val transcript = alternatives.firstOrNull()
        if (transcript == null) {
            rejectPending("No meal was recognised.", "no_match")
            return
        }

        val confidenceScores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
        val confidence = confidenceScores?.firstOrNull()?.takeIf { it >= 0f }
        val payload = JSObject().apply {
            put("transcript", transcript)
            put("confidence", confidence?.toDouble())
            put("alternatives", JSArray(alternatives))
        }
        resolvePending(payload)
    }

    override fun onError(error: Int) {
        if (cancelledByClient) return
        val failure = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> Triple("Your microphone is unavailable.", "audio_error", null)
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> Triple("Microphone permission was not granted.", "permission_denied", null)
            SpeechRecognizer.ERROR_NETWORK -> Triple("Speech recognition needs a connection.", "network", null)
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> Triple("Speech recognition timed out.", "network_timeout", null)
            SpeechRecognizer.ERROR_NO_MATCH -> Triple("No meal was recognised.", "no_match", null)
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> Triple("The microphone is already listening.", "busy", null)
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> Triple("No speech was heard.", "no_speech", null)
            SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> Triple("Speech recognition is temporarily unavailable.", "server", null)
            else -> Triple("Voice entry could not understand that meal.", "recognition_failed", null)
        }
        rejectPending(failure.first, failure.second, failure.third)
    }

    private fun resolvePending(payload: JSObject) {
        val call = pendingCall ?: return
        pendingCall = null
        releaseRecognizer()
        call.resolve(payload)
    }

    private fun rejectPending(message: String, code: String, error: Exception? = null) {
        val call = pendingCall ?: return
        pendingCall = null
        releaseRecognizer()
        if (error != null) call.reject(message, code, error) else call.reject(message, code)
    }

    private fun releaseRecognizer() {
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    override fun handleOnDestroy() {
        bridge.executeOnMainThread {
            cancelledByClient = true
            speechRecognizer?.cancel()
            pendingCall = null
            releaseRecognizer()
        }
        super.handleOnDestroy()
    }

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onPartialResults(partialResults: Bundle?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
}
