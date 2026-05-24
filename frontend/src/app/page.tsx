import { redirect } from "next/navigation";

export default function HomePage() {
  // Redirect the root path automatically to the login page
  redirect("/login");
}
