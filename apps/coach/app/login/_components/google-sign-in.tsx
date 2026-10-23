"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/identity/authClient";

/** Leaves for Google; Better Auth brings the coach back to the admin, or here with `?error=`. */
export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = async () => {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/admin", errorCallbackURL: "/login" });
    if (error) {
      setPending(false);
      setFailed(true);
    }
  };

  return (
    <div className="grid gap-2">
      <Button size="lg" className="h-11 w-full text-base" onClick={signIn} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Se connecter avec Google
      </Button>
      {failed ? <p className="text-sm text-destructive">Google est injoignable pour le moment. Réessaie.</p> : null}
    </div>
  );
}
