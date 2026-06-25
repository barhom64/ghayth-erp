/**
 * FormShell fields — behavioral (interaction) tests. Batch 3 of the FE
 * behavioral-coverage effort (ghayth-review documented gap).
 *
 * FormShell (react-hook-form + zodResolver) is the unified create/edit form
 * behind the create pages. The contract that matters: filling fields and
 * submitting runs Zod validation — invalid input shows the schema's Arabic
 * messages and BLOCKS onSubmit; valid input calls onSubmit with the values;
 * and correcting an error lets the form through. These tests drive the real
 * components with userEvent (text/email inputs + the native FormSelectField),
 * submitting the form directly so neither the Radix submit-button nor a date
 * picker is needed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { FormShell, FormTextField, FormEmailField, FormSelectField } from "@workspace/ui-core";

afterEach(() => cleanup());

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  email: z.string().email("بريد غير صحيح"),
  role: z.string().min(1, "الدور مطلوب"),
});
const defaults = { name: "", email: "", role: "" };
const roleOptions = [
  { value: "admin", label: "مدير" },
  { value: "user", label: "مستخدم" },
];

function renderForm(onSubmit: (v: unknown) => void) {
  const utils = render(
    <FormShell schema={schema} defaultValues={defaults} onSubmit={onSubmit} hideSubmit>
      <FormTextField name="name" label="الاسم" required />
      <FormEmailField name="email" label="البريد" required />
      <FormSelectField name="role" label="الدور" required options={roleOptions} placeholder="اختر" />
    </FormShell>,
  );
  return { ...utils, form: utils.container.querySelector("form")! };
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/الاسم/), "أحمد علي");
  await userEvent.type(screen.getByLabelText(/البريد/), "ahmed@door.sa");
  await userEvent.selectOptions(screen.getByLabelText(/الدور/), "admin");
}

describe("FormShell — validation gates submit", () => {
  it("submitting empty shows every required error and does NOT call onSubmit", async () => {
    const onSubmit = vi.fn();
    const { form } = renderForm(onSubmit);

    fireEvent.submit(form);

    expect(await screen.findByText("الاسم مطلوب")).toBeInTheDocument();
    expect(screen.getByText("بريد غير صحيح")).toBeInTheDocument();
    expect(screen.getByText("الدور مطلوب")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("an invalid email format blocks submit and shows the email error", async () => {
    const onSubmit = vi.fn();
    const { form } = renderForm(onSubmit);

    await userEvent.type(screen.getByLabelText(/الاسم/), "أحمد");
    await userEvent.selectOptions(screen.getByLabelText(/الدور/), "user");
    await userEvent.type(screen.getByLabelText(/البريد/), "not-an-email");

    fireEvent.submit(form);

    expect(await screen.findByText("بريد غير صحيح")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("FormShell — valid input reaches onSubmit", () => {
  it("calls onSubmit with the typed text + selected option", async () => {
    const onSubmit = vi.fn();
    const { form } = renderForm(onSubmit);

    await fillValid();
    fireEvent.submit(form);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "أحمد علي",
      email: "ahmed@door.sa",
      role: "admin",
    });
  });

  it("correcting an invalid form clears the error and lets it submit", async () => {
    const onSubmit = vi.fn();
    const { form } = renderForm(onSubmit);

    // first attempt — empty → blocked with an error
    fireEvent.submit(form);
    expect(await screen.findByText("الاسم مطلوب")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // fix everything → the name error disappears and onSubmit runs
    await fillValid();
    fireEvent.submit(form);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("الاسم مطلوب")).not.toBeInTheDocument();
  });
});
