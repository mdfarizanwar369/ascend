package fit.getascend.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
    companion object {
        private const val PERMISSION_TIMEOUT_MS = 20_000L
        private const val PERMISSION_SETTLE_DELAY_MS = 300L
        private const val LISTENING_TIMEOUT_MS = 15_000L
        private const val RESULT_TIMEOUT_MS = 2_500L
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingCall: PluginCall? = null
    private var permissionCall: PluginCall? = null
    private var cancelledByClient = false
    private val permissionTimeout = Runnable {
        val call = permissionCall ?: return@Runnable
        permissionCall = null
        call.reject("Microphone permission took too long. Nothing was saved.", "speech_timeout")
    }
    private val listeningTimeout = Runnable {
        if (pendingCall == null) return@Runnable
        cancelledByClient = true
        speechRecognizer?.cancel()
        rejectPending("Listening took too long. Nothing was saved.", "speech_timeout")
    }
    private val resultTimeout = Runnable {
        if (pendingCall == null) return@Runnable
        cancelledByClient = true
        speechRecognizer?.cancel()
        rejectPending("Speech recognition did not return a meal. Nothing was saved.", "speech_timeout")
    }

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
        if (pendingCall != null || permissionCall != null) {
            call.reject("The microphone is already listening.", "busy")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            call.reject("Speech recognition is not available on this device.", "unavailable")
            return
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            permissionCall = call
            mainHandler.postDelayed(permissionTimeout, PERMISSION_TIMEOUT_MS)
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
            return
        }
        beginListening(call)
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        if (permissionCall !== call) return
        mainHandler.removeCallbacks(permissionTimeout)
        permissionCall = null
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission was not granted.", "permission_denied")
            return
        }
        beginListening(call, PERMISSION_SETTLE_DELAY_MS)
    }

    private fun beginListening(call: PluginCall, startDelayMs: Long = 0L) {
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

            val startRecognizer = Runnable {
                if (pendingCall !== call) return@Runnable
                try {
                    speechRecognizer?.startListening(intent)
                    mainHandler.postDelayed(listeningTimeout, LISTENING_TIMEOUT_MS)
                } catch (error: Exception) {
                    rejectPending("Voice entry could not start.", "recognition_failed", error)
                }
            }
            if (startDelayMs > 0) mainHandler.postDelayed(startRecognizer, startDelayMs) else startRecognizer.run()
        }
    }

    @PluginMethod
    fun stopListening(call: PluginCall) {
        bridge.executeOnMainThread {
            if (pendingCall == null) {
                call.resolve(JSObject().put("stopped", false))
                return@executeOnMainThread
            }
            mainHandler.removeCallbacks(listeningTimeout)
            speechRecognizer?.stopListening()
            mainHandler.postDelayed(resultTimeout, RESULT_TIMEOUT_MS)
            call.resolve(JSObject().put("stopped", true))
        }
    }

    @PluginMethod
    fun cancelListening(call: PluginCall) {
        bridge.executeOnMainThread {
            val wasListening = pendingCall != null || permissionCall != null
            cancelledByClient = true
            mainHandler.removeCallbacks(permissionTimeout)
            permissionCall?.let {
                permissionCall = null
                it.reject("Listening was cancelled.", "cancelled")
            }
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
        clearRecognitionTimeouts()
        releaseRecognizer()
        call.resolve(payload)
    }

    private fun rejectPending(message: String, code: String, error: Exception? = null) {
        val call = pendingCall ?: return
        pendingCall = null
        clearRecognitionTimeouts()
        releaseRecognizer()
        if (error != null) call.reject(message, code, error) else call.reject(message, code)
    }

    private fun releaseRecognizer() {
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    private fun clearRecognitionTimeouts() {
        mainHandler.removeCallbacks(listeningTimeout)
        mainHandler.removeCallbacks(resultTimeout)
    }

    override fun handleOnDestroy() {
        bridge.executeOnMainThread {
            cancelledByClient = true
            mainHandler.removeCallbacks(permissionTimeout)
            permissionCall?.reject("Voice entry closed before permission completed.", "cancelled")
            permissionCall = null
            speechRecognizer?.cancel()
            pendingCall?.reject("Voice entry closed before recognition completed.", "cancelled")
            pendingCall = null
            clearRecognitionTimeouts()
            releaseRecognizer()
        }
        super.handleOnDestroy()
    }

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() {
        mainHandler.removeCallbacks(listeningTimeout)
        mainHandler.postDelayed(resultTimeout, RESULT_TIMEOUT_MS)
    }
    override fun onPartialResults(partialResults: Bundle?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
}
