import { redirect } from "next/navigation";

/** The roster is the admin's home. */
export default function AdminPage(): never {
  redirect("/admin/athletes");
}
