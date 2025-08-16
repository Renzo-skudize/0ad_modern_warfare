var g_Trigger = new Trigger();

// Register a trigger to run every few seconds.
g_Trigger.RegisterTrigger("Interval", "check_idle_units", check_idle_units, { "interval": 500 }); // Check every 0.5 seconds

function check_idle_units(data) {
    let entities = Engine.QueryInterface(IID_Entity, {
        "active": true
    });

    for (let entity of entities) {
        let cmpMotion = Engine.QueryInterface(entity, IID_Motion);
        let cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);

        if (!cmpMotion || !cmpUnitAI) {
            continue;
        }

        // Check if the unit is moving but has no specific target.
        if (cmpMotion.IsMoving() && cmpUnitAI.GetTarget() === -1) {
            // Set the target to the unit's current position.
            let position = cmpMotion.GetPosition();
            cmpUnitAI.SetTarget({
                "x": position.x + 5,
                "y": position.y,
                "z": position.z
            });
        }
    }
}
