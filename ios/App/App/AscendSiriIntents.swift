import AppIntents

@available(iOS 16.0, *)
private func ascendAnswer(_ metric: String) async -> IntentDialog {
    IntentDialog(stringLiteral: await AscendSiriService.answer(metric))
}

@available(iOS 16.0, *)
struct AscendCaloriesLeftIntent: AppIntent {
    static var title: LocalizedStringResource = "Calories left in Ascend"
    static var description = IntentDescription("Check how many calories remain in today's Ascend guide.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("calories_remaining"))
    }
}

@available(iOS 16.0, *)
struct AscendCaloriesLoggedIntent: AppIntent {
    static var title: LocalizedStringResource = "Calories logged in Ascend"
    static var description = IntentDescription("Check calories logged in Ascend today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("calories_consumed"))
    }
}

@available(iOS 16.0, *)
struct AscendWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Water in Ascend"
    static var description = IntentDescription("Check water logged and remaining today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("water_status"))
    }
}

@available(iOS 16.0, *)
struct AscendProteinIntent: AppIntent {
    static var title: LocalizedStringResource = "Protein in Ascend"
    static var description = IntentDescription("Check protein logged and remaining today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("protein_status"))
    }
}

@available(iOS 16.0, *)
struct AscendTodaySummaryIntent: AppIntent {
    static var title: LocalizedStringResource = "Ascend daily summary"
    static var description = IntentDescription("Hear today's calories, protein, water, and calorie balance.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("today_summary"))
    }
}

@available(iOS 16.0, *)
struct AscendSiriShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AscendCaloriesLeftIntent(), phrases: [
            "Ask \(.applicationName) how many calories I can eat now",
            "Ask \(.applicationName) how many calories I have left",
            "How many calories are left in \(.applicationName)"
        ], shortTitle: "Calories left", systemImageName: "flame")
        AppShortcut(intent: AscendCaloriesLoggedIntent(), phrases: [
            "Ask \(.applicationName) how many calories I have eaten",
            "How many calories have I logged in \(.applicationName)"
        ], shortTitle: "Calories logged", systemImageName: "fork.knife")
        AppShortcut(intent: AscendWaterIntent(), phrases: [
            "Ask \(.applicationName) how much water I have drunk",
            "How much water have I logged in \(.applicationName)",
            "Ask \(.applicationName) how much water I have left"
        ], shortTitle: "Water today", systemImageName: "drop")
        AppShortcut(intent: AscendProteinIntent(), phrases: [
            "Ask \(.applicationName) how much protein I have had",
            "How much protein do I have left in \(.applicationName)"
        ], shortTitle: "Protein today", systemImageName: "bolt")
        AppShortcut(intent: AscendTodaySummaryIntent(), phrases: [
            "Ask \(.applicationName) for my daily summary",
            "How am I doing today in \(.applicationName)"
        ], shortTitle: "Today in Ascend", systemImageName: "chart.bar")
    }
}
