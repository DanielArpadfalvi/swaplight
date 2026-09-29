package com.example.projectkickoff.integration;

import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.service.ProvisioningContext;

/**
 * Egy külső rendszer kezelése (létrehozás + tagok felvétele).
 *
 * <p>Az implementációknak <b>idempotensnek</b> kell lenniük ("find or create"):
 * egy hibás lépés újrafuttatása nem hozhat létre duplikátumot.
 * Ha egy tag nem található a külső rendszerben, az figyelmeztetés, nem hiba.
 * Hiba esetén kivételt kell dobni.
 */
public interface StepHandler {

    StepType type();

    StepResult execute(ProvisioningContext context) throws Exception;
}
