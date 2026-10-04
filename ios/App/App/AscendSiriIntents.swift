import AppIntents

@available(iOS 16.0, *)
private func ascendAnswer(_ metric: String) async -> IntentDialog {
    IntentDialog(stringLiteral: await AscendSiriService.answer(metric))
}

@available(iOS 16.0, *)
private func ascendQuestion(_ question: String) async -> IntentDialog {
    IntentDialog(stringLiteral: await AscendSiriService.ask(question))
}

@available(iOS 16.0, *)
struct AscendAskIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Ascend"
    static var description = IntentDescription("Ask about your Ascend food, water, workouts, progress, or account.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Question", requestValueDialog: .init(stringLiteral: "What would you like to ask Ascend?"))
    var question: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Ascend \(\.$question)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion(question))
    }
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
struct AscendWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Workout in Ascend"
    static var description = IntentDescription("Hear your Zoe workout for today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("What is my workout today?"))
    }
}

@available(iOS 16.0, *)
struct AscendWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "Weight in Ascend"
    static var description = IntentDescription("Hear your latest logged weight.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("What is my latest weight?"))
    }
}

@available(iOS 16.0, *)
struct AscendStepsIntent: AppIntent {
    static var title: LocalizedStringResource = "Steps in Ascend"
    static var description = IntentDescription("Check steps synced with Ascend.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("How many steps today?"))
    }
}

@available(iOS 16.0, *)
struct AscendSleepIntent: AppIntent {
    static var title: LocalizedStringResource = "Sleep in Ascend"
    static var description = IntentDescription("Check your sleep quality check-in.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("How did I sleep today?"))
    }
}

@available(iOS 16.0, *)
struct AscendSiriShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AscendAskIntent(), phrases: [
            "Ask \(.applicationName) a question",
            "Ask \(.applicationName) about my day",
            "Check my information in \(.applicationName)",
            "Check with \(.applicationName)"
        ], shortTitle: "Ask Ascend", systemImageName: "questionmark.bubble")
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
            "Ask \(.applicationName) how much water I drank",
            "Check how much water I drank in \(.applicationName)",
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
        AppShortcut(intent: AscendWorkoutIntent(), phrases: [
            "Ask \(.applicationName) what my workout is today",
            "What's my workout in \(.applicationName)"
        ], shortTitle: "Today's workout", systemImageName: "figure.strengthtraining.traditional")
        AppShortcut(intent: AscendWeightIntent(), phrases: [
            "Ask \(.applicationName) what my weight is",
            "What's my latest weight in \(.applicationName)"
        ], shortTitle: "Latest weight", systemImageName: "scalemass")
        AppShortcut(intent: AscendStepsIntent(), phrases: [
            "Ask \(.applicationName) how many steps I have today",
            "How many steps in \(.applicationName)"
        ], shortTitle: "Steps today", systemImageName: "figure.walk")
        AppShortcut(intent: AscendSleepIntent(), phrases: [
            "Ask \(.applicationName) how I slept",
            "How was my sleep in \(.applicationName)"
        ], shortTitle: "Sleep check-in", systemImageName: "moon.zzz")
    }
}
