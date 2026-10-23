"use client";

import { createAuthClient } from "better-auth/react";

/** Better Auth from the browser (INI-85): a coach's Google sign in and sign out, on this origin. */
export const authClient = createAuthClient();
