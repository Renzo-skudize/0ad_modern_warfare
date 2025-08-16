var g_Trigger = new Trigger();

// Der Trigger wird alle 2 Sekunden ausgeführt, um die Spielperformance nicht zu beeinträchtigen.
g_Trigger.RegisterTrigger("Interval", "check_idle_aircraft", check_idle_aircraft, { "interval": 2000 });

function check_idle_aircraft() {
    let entities = Engine.QueryInterface(IID_Entity, {
        "active": true
    });

    for (let entity of entities) {
        let cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);
        let cmpIdentity = Engine.QueryInterface(entity, IID_Identity);
        let cmpMotion = Engine.QueryInterface(entity, IID_Motion);

        if (!cmpUnitAI || !cmpIdentity || !cmpMotion) {
            continue;
        }
        
        // Überprüfen, ob es sich um ein Flugzeug handelt und es keine Befehle hat.
        // HINWEIS: Ersetzen Sie den Pfad durch den tatsächlichen Template-Namen Ihres Flugzeugs.
        if (cmpIdentity.HasTag("plane") && cmpUnitAI.GetTarget() === -1) {
            
            // Holen Sie die aktuelle Position der Einheit.
            let position = cmpMotion.GetPosition();

            // Definieren Sie das Startziel. Hier wird eine Position 50 Meter östlich
            // (x+50) und 50 Meter nördlich (y+50) vom aktuellen Standort gesetzt.
            let targetPosition = {
                "x": position.x + 50,
                "y": position.y + 50,
                "z": position.z
            };

            // Setzen Sie das neue Ziel für die Einheit.
            cmpUnitAI.SetTarget(targetPosition);
        }
    }
}
