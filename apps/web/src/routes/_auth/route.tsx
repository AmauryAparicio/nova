import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    const { data: customerState } = await authClient.customer.state();
    return { customerState, session };
  },
  component: AuthLayout,
  ssr: false,
});

function AuthLayout() {
  return <Outlet />;
}
