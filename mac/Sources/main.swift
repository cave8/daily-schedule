// Daily Schedule per Mac
// Una finestra che contiene l'app web Daily Schedule e, con il permesso dell'utente,
// le passa in SOLA LETTURA gli eventi di Apple Calendar e i promemoria di Apple Promemoria
// tramite EventKit. Nessuna porta di rete aperta: i dati passano solo dentro l'app.
import Cocoa
import WebKit
import EventKit

let appURL = URL(string: ProcessInfo.processInfo.environment["DS_URL"] ?? "https://daily-schedules.netlify.app/")!
let allowedHosts: Set<String> = ["daily-schedules.netlify.app", "localhost", "127.0.0.1"]

// MARK: - Accesso ai dati Apple (solo lettura)

final class AppleData {
    let store = EKEventStore()

    static func statusName(_ s: EKAuthorizationStatus) -> String {
        switch s {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .fullAccess: return "fullAccess"
        case .writeOnly: return "writeOnly"
        case .authorized: return "fullAccess"
        @unknown default: return "unknown"
        }
    }

    func status() -> [String: Any] {
        return [
            "calendar": AppleData.statusName(EKEventStore.authorizationStatus(for: .event)),
            "reminders": AppleData.statusName(EKEventStore.authorizationStatus(for: .reminder)),
            "readOnly": false,
            "writes": ["completeReminder"],
            "version": "0.2",
        ]
    }

    func requestAccess(_ kind: String, done: @escaping (Bool, String?) -> Void) {
        let finish: (Bool, Error?) -> Void = { ok, err in DispatchQueue.main.async { done(ok, err?.localizedDescription) } }
        if kind == "reminders" {
            store.requestFullAccessToReminders(completion: finish)
        } else {
            store.requestFullAccessToEvents(completion: finish)
        }
    }

    private let iso: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f
    }()
    private let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func hex(_ c: CGColor?) -> String? {
        guard let c = c, let rgb = NSColor(cgColor: c)?.usingColorSpace(.sRGB) else { return nil }
        return String(format: "#%02x%02x%02x", Int(rgb.redComponent * 255), Int(rgb.greenComponent * 255), Int(rgb.blueComponent * 255))
    }

    func events(days: Int) -> [[String: Any]] {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return [] }
        let cal = Calendar.current
        let start = cal.date(byAdding: .day, value: -1, to: cal.startOfDay(for: Date()))!
        let end = cal.date(byAdding: .day, value: max(1, min(days, 60)), to: cal.startOfDay(for: Date()))!
        let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        var out: [[String: Any]] = []
        for e in store.events(matching: pred) {
            // eventi rifiutati: non contano
            if let me = e.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { continue }
            let baseId = e.calendarItemIdentifier
            var item: [String: Any] = [
                "id": baseId + "@" + iso.string(from: e.startDate),
                "externalId": baseId,
                "title": e.title ?? "(senza titolo)",
                "allDay": e.isAllDay,
                "recurring": e.hasRecurrenceRules,
                "calendar": e.calendar?.title ?? "",
                "free": e.availability == .free,
            ]
            if e.isAllDay {
                item["start"] = day.string(from: e.startDate)
                let endBase: Date = e.endDate ?? e.startDate
                let endDay: Date = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: endBase)) ?? endBase
                item["end"] = day.string(from: endDay)
            } else {
                item["start"] = iso.string(from: e.startDate)
                item["end"] = iso.string(from: e.endDate)
            }
            if let l = e.location, !l.isEmpty { item["location"] = l }
            if let n = e.notes, !n.isEmpty { item["notes"] = String(n.prefix(1000)) }
            if let m = e.lastModifiedDate { item["externalModified"] = iso.string(from: m) }
            if let c = hex(e.calendar?.cgColor) { item["calendarColor"] = c }
            out.append(item)
        }
        return out
    }

    private func reminderItem(_ r: EKReminder) -> [String: Any] {
        var item: [String: Any] = [
            "id": r.calendarItemIdentifier,
            "title": r.title ?? "(senza titolo)",
            "list": r.calendar?.title ?? "",
            "priority": r.priority,
            "completed": r.isCompleted,
        ]
        if let dc = r.dueDateComponents, let d = Calendar.current.date(from: dc) {
            item["due"] = (dc.hour != nil) ? iso.string(from: d) : day.string(from: d)
            item["hasTime"] = dc.hour != nil
        }
        if let rule = r.recurrenceRules?.first {
            let freq: String
            switch rule.frequency {
            case .daily: freq = "daily"
            case .weekly: freq = "weekly"
            case .monthly: freq = "monthly"
            case .yearly: freq = "yearly"
            @unknown default: freq = "other"
            }
            var rec: [String: Any] = ["frequency": freq, "interval": rule.interval]
            if let dw = rule.daysOfTheWeek, !dw.isEmpty { rec["daysOfWeek"] = dw.map { $0.dayOfTheWeek.rawValue - 1 } } // 0 = domenica
            if let dm = rule.daysOfTheMonth, !dm.isEmpty { rec["daysOfMonth"] = dm.map { $0.intValue } }
            if let end = rule.recurrenceEnd?.endDate { rec["until"] = day.string(from: end) }
            item["recurrence"] = rec
        }
        // Avvisi: l'ora dell'avviso è spesso "l'orario" del promemoria
        if let alarms = r.alarms, !alarms.isEmpty {
            item["alarms"] = alarms.map { al -> [String: Any] in
                var a: [String: Any] = [:]
                if let d = al.absoluteDate { a["at"] = iso.string(from: d) } else { a["offset"] = al.relativeOffset }
                return a
            }
        }
        if let sc = r.startDateComponents, let d = Calendar.current.date(from: sc) {
            item["start"] = (sc.hour != nil) ? iso.string(from: d) : day.string(from: d)
        }
        if let n = r.notes, !n.isEmpty { item["notes"] = String(n.prefix(1000)) }
        if let m = r.lastModifiedDate { item["externalModified"] = iso.string(from: m) }
        if let c = r.completionDate { item["completedAt"] = iso.string(from: c) }
        return item
    }

    func reminders(done: @escaping ([[String: Any]]) -> Void) {
        guard EKEventStore.authorizationStatus(for: .reminder) == .fullAccess else { done([]); return }
        let open = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
        let since = Calendar.current.date(byAdding: .day, value: -3, to: Date())!
        let closed = store.predicateForCompletedReminders(withCompletionDateStarting: since, ending: Date(), calendars: nil)
        store.fetchReminders(matching: open) { a in
            let first = (a ?? []).map { self.reminderItem($0) }
            self.store.fetchReminders(matching: closed) { b in
                let second = (b ?? []).map { self.reminderItem($0) }
                DispatchQueue.main.async { done(first + second) }
            }
        }
    }
}

// MARK: - Finestra con l'app web

final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    let data: AppleData
    init(data: AppleData) { self.data = data }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        // Rispondiamo solo alla nostra app, mai ad altri siti
        guard allowedHosts.contains(message.frameInfo.securityOrigin.host), message.frameInfo.isMainFrame else {
            replyHandler(nil, "origine non autorizzata"); return
        }
        guard let body = message.body as? [String: Any], let method = body["method"] as? String else {
            replyHandler(nil, "richiesta non valida"); return
        }
        let params = body["params"] as? [String: Any] ?? [:]
        switch method {
        case "status":
            replyHandler(data.status(), nil)
        case "requestAccess":
            let kind = params["kind"] as? String ?? "calendar"
            data.requestAccess(kind) { ok, err in
                var s = self.data.status(); s["granted"] = ok
                if let err = err { s["error"] = err }
                replyHandler(s, nil)
            }
        case "fetch":
            let days = params["days"] as? Int ?? 21
            let wantReminders = params["reminders"] as? Bool ?? true
            let wantEvents = params["calendar"] as? Bool ?? true
            let events = wantEvents ? data.events(days: days) : []
            if wantReminders {
                data.reminders { rem in replyHandler(["events": events, "reminders": rem, "status": self.data.status()], nil) }
            } else {
                replyHandler(["events": events, "reminders": [], "status": data.status()], nil)
            }
        case "completeReminder":
            // Unica scrittura permessa: completare (o riaprire) UN promemoria che l'utente ha spuntato.
            guard EKEventStore.authorizationStatus(for: .reminder) == .fullAccess else { replyHandler(nil, "permesso Promemoria mancante"); return }
            guard let id = params["id"] as? String, let r = data.store.calendarItem(withIdentifier: id) as? EKReminder else {
                replyHandler(["ok": false, "error": "promemoria non trovato (forse eliminato)"], nil); return
            }
            let completed = params["completed"] as? Bool ?? true
            if r.isCompleted == completed { replyHandler(["ok": true, "already": true], nil); return } // già fatto: niente doppioni
            let dueBefore = r.dueDateComponents.flatMap { Calendar.current.date(from: $0) }
            r.isCompleted = completed
            do { try data.store.save(r, commit: true) } catch {
                replyHandler(["ok": false, "error": "non salvato: \(error.localizedDescription)"], nil); return
            }
            // Verifica: rileggo il promemoria da Apple
            data.store.refreshSourcesIfNecessary()
            let check = data.store.calendarItem(withIdentifier: id) as? EKReminder
            let dueAfter = check?.dueDateComponents.flatMap { Calendar.current.date(from: $0) }
            let advanced = r.hasRecurrenceRules && dueBefore != nil && dueAfter != nil && dueAfter! > dueBefore!
            let ok = completed ? (check == nil || check!.isCompleted || advanced) : (check?.isCompleted == false)
            var res: [String: Any] = ["ok": ok, "completed": check?.isCompleted ?? completed, "advanced": advanced]
            if !ok { res["error"] = "verifica non riuscita" }
            replyHandler(res, nil)
        default:
            // Nessun'altra operazione di scrittura: niente creazione, modifica o eliminazione
            replyHandler(nil, "operazione non disponibile: «\(method)»")
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let data = AppleData()

    func applicationDidFinishLaunching(_ n: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.addScriptMessageHandler(Bridge(data: data), contentWorld: .page, name: "apple")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.customUserAgent = nil

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Daily Schedule"
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 420, height: 560)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("DailyScheduleMain")
        window.makeKeyAndOrderFront(nil)

        buildMenu()
        load()

        // Quando cambia qualcosa in Calendario o Promemoria, l'app web si aggiorna
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: data.store, queue: .main) { [weak self] _ in
            self?.web.evaluateJavaScript("window.dispatchEvent(new Event('apple-changed'))", completionHandler: nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func load() { web.load(URLRequest(url: appURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20)) }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Ricarica", action: #selector(reload), keyEquivalent: "r")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Esci da Daily Schedule", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        // Menu Modifica: serve per copia/incolla nei campi di testo
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Modifica")
        edit.addItem(withTitle: "Annulla", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Ripeti", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Taglia", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copia", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Incolla", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Seleziona tutto", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        NSApp.mainMenu = main
    }

    @objc func reload() { load() }

    // I link esterni si aprono nel browser
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, let host = url.host, !allowedHosts.contains(host), action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    // Finestre di conferma (confirm/alert) usate dall'app web
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Annulla")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }
    // Scegliere un file (ripristino del backup)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = false
        p.begin { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showOffline() }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showOffline() }

    func showOffline() {
        let html = """
        <html><body style="font:15px -apple-system;text-align:center;padding:80px 30px;color:#121212;background:#fafaf8">
        <h2 style="letter-spacing:.04em">NON RIESCO A CARICARE DAILY SCHEDULE</h2>
        <p style="color:#8f8f8a">Controlla la connessione a internet, poi premi ⌘R per riprovare.</p></body></html>
        """
        web.loadHTMLString(html, baseURL: nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
}

// Prova senza finestra: stampa lo stato dei permessi (non chiede nulla)
if CommandLine.arguments.contains("--status") {
    let s = AppleData().status()
    print("calendar=\(s["calendar"]!) reminders=\(s["reminders"]!)")
    exit(0)
}

// Autoverifica: carica l'app web senza finestra visibile e prova il ponte (non chiede permessi)
final class SelfTest: NSObject, WKNavigationDelegate {
    var web: WKWebView!
    let data = AppleData()
    func start() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.addScriptMessageHandler(Bridge(data: data), contentWorld: .page, name: "apple")
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
        web.navigationDelegate = self
        web.load(URLRequest(url: appURL))
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { print("SELFTEST FAIL timeout"); exit(1) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let js = """
        const out = { available: G.apple.available() };
        out.status = await G.apple.call("status");
        const f = await G.apple.call("fetch", { days: 7 });
        out.fetch = { events: Array.isArray(f.events), reminders: Array.isArray(f.reminders) };
        try { await G.apple.call("deleteEvent", { id: "x" }); out.writeBlocked = false; } catch (e) { out.writeBlocked = String(e).includes("non disponibile"); }
        return JSON.stringify(out);
        """
        webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let v): print("SELFTEST OK \(v)"); exit(0)
            case .failure(let e): print("SELFTEST FAIL \(e)"); exit(1)
            }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("SELFTEST FAIL load \(error.localizedDescription)"); exit(1)
    }
}

// Diagnosi: scrive in un file i promemoria che si ripetono (solo lettura)
if let i = CommandLine.arguments.firstIndex(of: "--diag-reminders"), i + 1 < CommandLine.arguments.count {
    let path = CommandLine.arguments[i + 1]
    let store = EKEventStore()
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
    var lines = ["stato=\(AppleData.statusName(EKEventStore.authorizationStatus(for: .reminder)))"]
    let pred = store.predicateForReminders(in: nil)
    store.fetchReminders(matching: pred) { list in
        let all = list ?? []
        lines.append("totale=\(all.count) aperti=\(all.filter { !$0.isCompleted }.count)")
        for r in all where r.hasRecurrenceRules {
            let dc = r.dueDateComponents
            let due = dc.flatMap { Calendar.current.date(from: $0) }.map { f.string(from: $0) } ?? "nessuna"
            lines.append("RIPETUTO | \(r.title ?? "") | scadenza=\(due) | conOra=\(dc?.hour != nil) | completato=\(r.isCompleted) | regola=\(r.recurrenceRules?.first?.description ?? "")")
        }
        try? lines.joined(separator: "\n").write(toFile: path, atomically: true, encoding: .utf8)
        exit(0)
    }
    RunLoop.main.run()
}

if CommandLine.arguments.contains("--selftest") {
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    let t = SelfTest()
    t.start()
    app.run()
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
