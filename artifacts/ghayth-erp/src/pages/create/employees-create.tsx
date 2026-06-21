import { EmployeeCreateForm } from "@/pages/create/employee-create-form";

// Thin page wrapper. The full create experience (page chrome, wizard nav,
// post-create credentials/success view, navigation) lives in
// EmployeeCreateForm's non-embedded (default) mode. The same form is reused
// inline by the AllowCreateDrawer (embedded mode) opened from EmployeeSelect.
export default function EmployeesCreate() {
  return <EmployeeCreateForm />;
}
