// «الكيان يقود التجربة» — عند اختيار مركبة في نموذج تشغيلي، يُعبّأ حقل السائق
// تلقائيًا بسائق المركبة المعيَّن (نفس ما تعرضه VehicleContextCard) بدل إجبار
// المستخدم على اختياره يدويًا. التعبئة **افتراضية وقابلة للتغيير**: تحدث فقط
// عند تغيّر المركبة وحين يكون حقل السائق فارغًا، فلا تطمس اختيارًا يدويًا.
//
// يقرأ المصدر القائم (fleet_vehicles.assignedDriverId عبر GET /fleet/vehicles/:id)
// — لا يقرّر مصدر الحقيقة الوحيد (ذاك قرار معماري)، بل يستثمر المتاح ليساعد.
import { useEffect, useRef } from "react";
import { useApiQuery } from "@/lib/api";

interface VehicleDriverInfo {
  /** Unified current driver — resolved from the active primary assignment
   *  (vehicle_driver_assignments) with a legacy assignedDriverId fallback. */
  currentDriverId?: number | null;
  assignedDriverId?: number | null;
  driverName?: string | null;
  currentMileage?: number | null;
}

export function useVehicleDriverDefault(
  vehicleId: string | number | null | undefined,
  driverId: string,
  setDriverId: (value: string) => void,
): { assignedDriverId: number | null; driverName: string | null } {
  const hasVehicle = vehicleId !== null && vehicleId !== undefined && String(vehicleId).trim() !== "";
  const { data } = useApiQuery<VehicleDriverInfo>(
    // Reuse VehicleContextCard's cache key + URL so this shares one fetch.
    ["vehicle-context", String(vehicleId ?? "")],
    hasVehicle ? `/fleet/vehicles/${vehicleId}` : null,
    { enabled: hasVehicle },
  );
  // Prefer the unified current driver (active assignment); fall back to legacy.
  const assigned = data?.currentDriverId ?? data?.assignedDriverId ?? null;

  const setterRef = useRef(setDriverId);
  setterRef.current = setDriverId;
  const lastVehicleRef = useRef<string | null>(null);

  useEffect(() => {
    const vk = hasVehicle ? String(vehicleId) : null;
    if (vk && vk !== lastVehicleRef.current && !driverId && assigned != null) {
      setterRef.current(String(assigned));
    }
    lastVehicleRef.current = vk;
  }, [vehicleId, assigned, driverId, hasVehicle]);

  return { assignedDriverId: assigned, driverName: data?.driverName ?? null };
}

/**
 * Same «entity leads the experience» pattern for the odometer field: picking a
 * vehicle defaults the mileage reading to the vehicle's current mileage, so the
 * operator confirms/adjusts instead of typing from scratch (and can't enter a
 * value below the known odometer by accident). Default + overridable: only when
 * the vehicle changes and the field is empty. Shares the vehicle fetch cache.
 */
export function useVehicleMileageDefault(
  vehicleId: string | number | null | undefined,
  mileage: string,
  setMileage: (value: string) => void,
): { currentMileage: number | null } {
  const hasVehicle = vehicleId !== null && vehicleId !== undefined && String(vehicleId).trim() !== "";
  const { data } = useApiQuery<VehicleDriverInfo>(
    ["vehicle-context", String(vehicleId ?? "")],
    hasVehicle ? `/fleet/vehicles/${vehicleId}` : null,
    { enabled: hasVehicle },
  );
  const current = data?.currentMileage ?? null;

  const setterRef = useRef(setMileage);
  setterRef.current = setMileage;
  const lastVehicleRef = useRef<string | null>(null);

  useEffect(() => {
    const vk = hasVehicle ? String(vehicleId) : null;
    if (vk && vk !== lastVehicleRef.current && !mileage && current != null) {
      setterRef.current(String(current));
    }
    lastVehicleRef.current = vk;
  }, [vehicleId, current, mileage, hasVehicle]);

  return { currentMileage: current };
}
