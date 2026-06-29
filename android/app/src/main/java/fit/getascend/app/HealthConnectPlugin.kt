package fit.getascend.app

import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

@CapacitorPlugin(name = "HealthSync")
class HealthConnectPlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    )

    private var permissionLauncher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermissionCall: PluginCall? = null

    override fun load() {
        permissionLauncher = bridge.activity.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract()
        ) { grantedPermissions ->
            val call = pendingPermissionCall ?: return@registerForActivityResult
            pendingPermissionCall = null
            call.resolve(buildStatusPayload(grantedPermissions))
        }
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        if (!isSdkAvailable()) {
            call.resolve(buildStatusPayload(emptySet()))
            return
        }

        pluginScope.launch {
            try {
                val granted = withContext(Dispatchers.IO) {
                    getClient().permissionController.getGrantedPermissions()
                }
                call.resolve(buildStatusPayload(granted))
            } catch (error: Exception) {
                call.reject("Could not read Health Connect permissions.", error)
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        if (!isSdkAvailable()) {
            call.reject("Health Connect is not available on this Android device.")
            return
        }

        val launcher = permissionLauncher
        if (launcher == null) {
            call.reject("Health Connect permissions are not ready yet.")
            return
        }

        pendingPermissionCall = call
        bridge.executeOnMainThread {
            launcher.launch(requiredPermissions)
        }
    }

    @PluginMethod
    fun sync(call: PluginCall) {
        if (!isSdkAvailable()) {
            call.reject("Health Connect is not available on this Android device.")
            return
        }

        pluginScope.launch {
            try {
                val client = getClient()
                val granted = withContext(Dispatchers.IO) {
                    client.permissionController.getGrantedPermissions()
                }
                if (!granted.containsAll(requiredPermissions)) {
                    call.reject("Health Connect permissions are not fully granted.")
                    return@launch
                }

                val result = withContext(Dispatchers.IO) {
                    buildSyncPayload(client, granted)
                }
                call.resolve(result)
            } catch (error: Exception) {
                call.reject("Health Connect sync failed.", error)
            }
        }
    }

    private fun getClient(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    private fun isSdkAvailable(): Boolean = sdkStatus() == HealthConnectClient.SDK_AVAILABLE

    private fun sdkStatus(): Int =
        HealthConnectClient.getSdkStatus(context, HEALTH_CONNECT_PROVIDER_PACKAGE_NAME)

    private fun availabilityValue(): String =
        when (sdkStatus()) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
            else -> "unavailable"
        }

    private fun buildStatusPayload(grantedPermissions: Set<String>): JSObject {
        return JSObject().apply {
            put("available", isSdkAvailable())
            put("availability", availabilityValue())
            put("permissionsGranted", stringArray(grantedPermissions.sorted()))
            put("allPermissionsGranted", grantedPermissions.containsAll(requiredPermissions))
        }
    }

    private suspend fun buildSyncPayload(
        client: HealthConnectClient,
        grantedPermissions: Set<String>
    ): JSObject {
        val zoneId = ZoneId.systemDefault()
        val now = ZonedDateTime.now(zoneId)
        val startOfTomorrow = now.toLocalDate().plusDays(1).atStartOfDay(zoneId).toInstant()
        val records = mutableListOf<JSObject>()

        for (offset in 0L..29L) {
            val day = now.toLocalDate().minusDays(offset)
            val dayStart = day.atStartOfDay(zoneId).toInstant()
            val dayEnd = day.plusDays(1).atStartOfDay(zoneId).toInstant()

            val stepsAggregate = client.aggregate(
                AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                )
            )
            val stepCount = (stepsAggregate[StepsRecord.COUNT_TOTAL] ?: 0L).toDouble()
            records += JSObject().apply {
                put("type", "steps_daily")
                put("externalRecordId", "steps-${day}")
                put("recordedOn", day.toString())
                put("valueNumeric", stepCount)
                put("unit", "count")
            }

            val caloriesAggregate = client.aggregate(
                AggregateRequest(
                    metrics = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                )
            )
            val activeCalories = caloriesAggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0
            records += JSObject().apply {
                put("type", "active_calories_daily")
                put("externalRecordId", "active-calories-${day}")
                put("recordedOn", day.toString())
                put("valueNumeric", activeCalories)
                put("unit", "kcal")
            }
        }

        val exerciseResponse = client.readRecords(
            ReadRecordsRequest(
                recordType = ExerciseSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(
                    now.minusDays(30).truncatedTo(ChronoUnit.DAYS).toInstant(),
                    startOfTomorrow
                )
            )
        )

        exerciseResponse.records.forEach { record ->
            val localDay = record.startTime.atZone(zoneId).toLocalDate().toString()
            val externalId = record.metadata.id.takeIf { it.isNotBlank() }
                ?: "exercise-${record.startTime.toEpochMilli()}-${record.endTime.toEpochMilli()}-${record.exerciseType}"
            val durationMinutes = ChronoUnit.MINUTES.between(record.startTime, record.endTime).toDouble()
            val metadata = JSObject().apply {
                put("exerciseType", record.exerciseType)
                put("title", record.title ?: "")
            }
            records += JSObject().apply {
                put("type", "exercise_session")
                put("externalRecordId", externalId)
                put("recordedOn", localDay)
                put("startAt", record.startTime.toString())
                put("endAt", record.endTime.toString())
                put("valueNumeric", durationMinutes)
                put("unit", "minutes")
                put("sourceApp", record.metadata.dataOrigin.packageName ?: "")
                put("metadata", metadata)
            }
        }

        return JSObject().apply {
            put("available", true)
            put("availability", availabilityValue())
            put("permissionsGranted", stringArray(grantedPermissions.sorted()))
            put("allPermissionsGranted", grantedPermissions.containsAll(requiredPermissions))
            put("timezone", zoneId.id)
            put("syncedAt", Instant.now().toString())
            put("records", objectArray(records))
        }
    }

    private fun stringArray(values: List<String>): JSArray {
        return JSArray().apply {
            values.forEach { put(it) }
        }
    }

    private fun objectArray(values: List<JSObject>): JSArray {
        return JSArray().apply {
            values.forEach { put(it) }
        }
    }

    companion object {
        private const val HEALTH_CONNECT_PROVIDER_PACKAGE_NAME = "com.google.android.apps.healthdata"
    }
}
