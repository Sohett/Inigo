import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { leadSchema, type LeadInput } from "@/lib/lead-schema";
import { form as copy } from "@/content/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Toaster } from "@/components/ui/sonner";

type Status = "idle" | "submitting" | "success" | "error";

export function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: { firstName: "", phone: "", consent: false, _hp: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus("submitting");
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data: { ok?: boolean; error?: string } = await response
        .json()
        .catch(() => ({}));

      if (response.ok && data.ok) {
        setStatus("success");
        toast.success(copy.success);
        return;
      }

      // Numéro rejeté côté serveur (validation E.164) → erreur inline sur le champ.
      if (response.status === 400 && data.error === "phone") {
        setError("phone", { type: "server", message: copy.errors.phone });
        setStatus("idle");
        return;
      }

      setStatus("error");
      toast.error(copy.errors.server);
    } catch {
      setStatus("error");
      toast.error(copy.errors.server);
    }
  });

  if (status === "success") {
    return (
      <>
        <Toaster />
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-base font-medium text-foreground">{copy.success}</p>
        </div>
      </>
    );
  }

  const submitting = status === "submitting";

  return (
    <>
      <Toaster />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {/* Honeypot anti-bot : hors écran, non focusable, doit rester vide. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="company">Ne pas remplir</label>
          <input id="company" tabIndex={-1} autoComplete="off" {...register("_hp")} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">
            {copy.labels.firstName}
            <span className="font-normal text-muted-foreground">({copy.labels.firstNameHint})</span>
          </Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            placeholder={copy.placeholders.firstName}
            {...register("firstName")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{copy.labels.phone}</Label>
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby="phone-error"
              />
            )}
          />
          <p id="phone-error" aria-live="polite" className="min-h-[1.25rem] text-sm text-destructive">
            {errors.phone?.message}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-encre focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby="consent-error"
              {...register("consent")}
            />
            <span>{copy.labels.consent}</span>
          </label>
          <p id="consent-error" aria-live="polite" className="text-sm text-destructive">
            {errors.consent?.message}
          </p>
        </div>

        <Button type="submit" size="lg" disabled={submitting} className="h-12 w-full text-base">
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </>
  );
}
