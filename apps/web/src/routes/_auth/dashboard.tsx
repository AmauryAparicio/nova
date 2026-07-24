import { Button } from "@nova/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session, customerState } = Route.useRouteContext();

  const trpc = useTRPC();
  const privateData = useQuery(trpc.privateData.queryOptions());

  const hasProSubscription =
    (customerState?.activeSubscriptions?.length ?? 0) > 0;

  const handlePortal = useCallback(async () => {
    await authClient.customer.portal();
  }, []);

  const handleUpgrade = useCallback(async () => {
    await authClient.checkout({ slug: "pro" });
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {session.data?.user.name}</p>
      <p>API: {privateData.data?.message}</p>
      <p>Plan: {hasProSubscription ? "Pro" : "Free"}</p>
      {hasProSubscription ? (
        <Button onClick={handlePortal}>Manage Subscription</Button>
      ) : (
        <Button onClick={handleUpgrade}>Upgrade to Pro</Button>
      )}
    </div>
  );
}
