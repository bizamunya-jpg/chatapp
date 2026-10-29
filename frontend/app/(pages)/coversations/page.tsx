import { redirect } from "next/navigation";

export default function MisspelledConversationsRoute() {
  redirect("/conversations");
}