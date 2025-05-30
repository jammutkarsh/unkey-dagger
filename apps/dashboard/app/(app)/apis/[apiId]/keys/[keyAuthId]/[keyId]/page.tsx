import { type Interval, IntervalSelect } from "@/app/(app)/apis/[apiId]/select";
import { StackedColumnChart } from "@/components/dashboard/charts";
import { PageContent } from "@/components/page-content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { Separator } from "@/components/ui/separator";
import { getOrgId } from "@/lib/auth";
import { clickhouse } from "@/lib/clickhouse";
import { and, db, eq, isNull, schema } from "@/lib/db";
import { formatNumber } from "@/lib/fmt";
import { Empty } from "@unkey/ui";
import { Button } from "@unkey/ui";
import { ArrowLeft, Settings2 } from "lucide-react";
import { Minus } from "lucide-react";
import ms from "ms";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchApiAndWorkspaceDataFromDb } from "../../../actions";
import { ApisNavbar } from "../../../api-id-navbar";
import { RBACButtons } from "./_components/rbac-buttons";
import { PermissionList } from "./permission-list";
import { VerificationTable } from "./verification-table";

export default async function APIKeyDetailPage(props: {
  params: {
    apiId: string;
    keyId: string;
    keyAuthId: string;
  };
  searchParams: {
    interval?: Interval;
  };
}) {
  const orgId = await getOrgId();

  const key = await db.query.keys.findFirst({
    where: and(eq(schema.keys.id, props.params.keyId), isNull(schema.keys.deletedAtM)),
    with: {
      keyAuth: true,
      roles: {
        with: {
          role: {
            with: {
              permissions: {
                with: {
                  permission: true,
                },
              },
            },
          },
        },
      },
      permissions: true,
      workspace: {
        with: {
          roles: {
            with: {
              permissions: true,
            },
          },
          permissions: {
            with: {
              roles: true,
            },
          },
        },
      },
    },
  });

  if (!key || key.workspace.orgId !== orgId) {
    return notFound();
  }

  const { currentApi, workspaceApis } = await fetchApiAndWorkspaceDataFromDb(props.params.apiId);
  const interval = props.searchParams.interval ?? "7d";

  const { getVerificationsPerInterval, start, end, granularity } = prepareInterval(interval);
  const query = {
    workspaceId: currentApi.workspaceId,
    keySpaceId: key.keyAuthId,
    keyId: key.id,
    start,
    end,
  };
  const [verifications, latestVerifications, lastUsed] = await Promise.all([
    getVerificationsPerInterval(query),
    clickhouse.verifications.logs({
      workspaceId: key.workspaceId,
      keySpaceId: key.keyAuthId,
      keyId: key.id,
      limit: 50,
    }),
    clickhouse.verifications
      .latest({
        workspaceId: key.workspaceId,
        keySpaceId: key.keyAuthId,
        keyId: key.id,
        limit: 1,
      })
      .then((res) => res.val?.at(0)?.time ?? 0),
  ]);

  const sortedVerifications = verifications.val!.sort((a, b) => a.time - b.time);

  const successOverTime: { x: string; y: number }[] = [];
  const ratelimitedOverTime: { x: string; y: number }[] = [];
  const usageExceededOverTime: { x: string; y: number }[] = [];
  const disabledOverTime: { x: string; y: number }[] = [];
  const insufficientPermissionsOverTime: { x: string; y: number }[] = [];
  const expiredOverTime: { x: string; y: number }[] = [];
  const forbiddenOverTime: { x: string; y: number }[] = [];

  const uniqueDates = [...new Set(sortedVerifications.map((d) => d.time))].sort((a, b) => a - b);

  for (const timestamp of uniqueDates) {
    const x = new Date(timestamp).toISOString();
    successOverTime.push({ x, y: 0 });
    ratelimitedOverTime.push({ x, y: 0 });
    usageExceededOverTime.push({ x, y: 0 });
    disabledOverTime.push({ x, y: 0 });
    insufficientPermissionsOverTime.push({ x, y: 0 });
    expiredOverTime.push({ x, y: 0 });
    forbiddenOverTime.push({ x, y: 0 });
  }

  for (const d of sortedVerifications) {
    const x = new Date(d.time).toISOString();
    const index = uniqueDates.indexOf(d.time);

    switch (d.outcome) {
      case "":
      case "VALID":
        successOverTime[index] = { x, y: d.count };
        break;
      case "RATE_LIMITED":
        ratelimitedOverTime[index] = { x, y: d.count };
        break;
      case "USAGE_EXCEEDED":
        usageExceededOverTime[index] = { x, y: d.count };
        break;
      case "DISABLED":
        disabledOverTime[index] = { x, y: d.count };
        break;
      case "INSUFFICIENT_PERMISSIONS":
        insufficientPermissionsOverTime[index] = { x, y: d.count };
        break;
      case "EXPIRED":
        expiredOverTime[index] = { x, y: d.count };
        break;
      case "FORBIDDEN":
        forbiddenOverTime[index] = { x, y: d.count };
        break;
    }
  }

  const verificationsData = [
    ...successOverTime.map((d) => ({
      ...d,
      category: "Successful Verifications",
    })),
    ...ratelimitedOverTime.map((d) => ({ ...d, category: "Ratelimited" })),
    ...usageExceededOverTime.map((d) => ({ ...d, category: "Usage Exceeded" })),
    ...disabledOverTime.map((d) => ({ ...d, category: "Disabled" })),
    ...insufficientPermissionsOverTime.map((d) => ({
      ...d,
      category: "Insufficient Permissions",
    })),
    ...expiredOverTime.map((d) => ({ ...d, category: "Expired" })),
    ...forbiddenOverTime.map((d) => ({ ...d, category: "Forbidden" })),
  ];

  const transientPermissionIds = new Set<string>();
  const connectedRoleIds = new Set<string>();
  for (const role of key.roles) {
    connectedRoleIds.add(role.roleId);
  }
  for (const role of key.workspace.roles) {
    if (connectedRoleIds.has(role.id)) {
      for (const p of role.permissions) {
        transientPermissionIds.add(p.permissionId);
      }
    }
  }

  const stats = {
    valid: 0,
    ratelimited: 0,
    usageExceeded: 0,
    disabled: 0,
    insufficientPermissions: 0,
    expired: 0,
    forbidden: 0,
  };
  verifications.val!.forEach((v) => {
    switch (v.outcome) {
      case "VALID":
        stats.valid += v.count;
        break;
      case "RATE_LIMITED":
        stats.ratelimited += v.count;
        break;
      case "USAGE_EXCEEDED":
        stats.usageExceeded += v.count;
        break;
      case "DISABLED":
        stats.disabled += v.count;
        break;
      case "INSUFFICIENT_PERMISSIONS":
        stats.insufficientPermissions += v.count;
        break;
      case "EXPIRED":
        stats.expired += v.count;
        break;
      case "FORBIDDEN":
        stats.forbidden += v.count;
    }
  });

  const rolesList = key.workspace.roles.map((role) => {
    return {
      id: role.id,
      name: role.name,
      isActive: key.roles.some((keyRole) => keyRole.roleId === role.id),
    };
  });

  return (
    <div>
      <ApisNavbar
        api={currentApi}
        activePage={{
          href: `/apis/${currentApi.id}/keys/${currentApi.keyAuthId}/${key.id}`,
          text: "Keys",
        }}
        keyId={key.id}
        apis={workspaceApis}
      />

      <PageContent>
        <div className="flex flex-col">
          <div className="flex items-center justify-between w-full">
            <Link
              href={`/apis/${props.params.apiId}/keys/${props.params.keyAuthId}/`}
              className="flex w-fit items-center gap-1 text-sm duration-200 text-content-subtle hover:text-secondary-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Back to API Keys listing
            </Link>
            <Link
              href={`/apis/${props.params.apiId}/keys/${props.params.keyAuthId}/${props.params.keyId}/settings`}
            >
              <Button>
                <Settings2 />
                Key settings
              </Button>
            </Link>
          </div>

          <div className="flex flex-col gap-4 mt-4">
            <Card>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:divide-x">
                <Metric
                  label={
                    key.expires && key.expires.getTime() < Date.now() ? "Expired" : "Expires in"
                  }
                  value={key.expires ? ms(key.expires.getTime() - Date.now()) : <Minus />}
                />
                <Metric
                  label="Remaining"
                  value={
                    typeof key.remaining === "number" ? formatNumber(key.remaining) : <Minus />
                  }
                />
                <Metric
                  label="Last Used"
                  value={lastUsed ? `${ms(Date.now() - lastUsed)} ago` : <Minus />}
                />
              </CardContent>
            </Card>
            <Separator className="my-8" />

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold leading-none tracking-tight">Verifications</h2>

              <div>
                <IntervalSelect defaultSelected={interval} />
              </div>
            </div>

            {verificationsData.some(({ y }) => y > 0) ? (
              <Card>
                <CardHeader>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 divide-x">
                    <Metric label="Valid" value={formatNumber(stats.valid)} />
                    <Metric label="Ratelimited" value={formatNumber(stats.ratelimited)} />
                    <Metric label="Usage Exceeded" value={formatNumber(stats.usageExceeded)} />
                    <Metric label="Disabled" value={formatNumber(stats.disabled)} />
                    <Metric
                      label="Insufficient Permissions"
                      value={formatNumber(stats.insufficientPermissions)}
                    />
                    <Metric label="Expired" value={formatNumber(stats.expired)} />
                    <Metric label="Forbidden" value={formatNumber(stats.forbidden)} />
                  </div>
                </CardHeader>
                <CardContent>
                  <StackedColumnChart
                    colors={["primary", "warn", "danger"]}
                    data={verificationsData}
                    timeGranularity={
                      granularity >= 1000 * 60 * 60 * 24 * 30
                        ? "month"
                        : granularity >= 1000 * 60 * 60 * 24
                          ? "day"
                          : "hour"
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <Empty>
                <Empty.Icon />
                <Empty.Title>Not used</Empty.Title>
                <Empty.Description>This key was not used in the last {interval}</Empty.Description>
              </Empty>
            )}

            {latestVerifications.val && latestVerifications.val.length > 0 ? (
              <>
                <Separator className="my-8" />
                <h2 className="text-2xl font-semibold leading-none tracking-tight mt-8">
                  Latest Verifications
                </h2>
                <VerificationTable verifications={latestVerifications} />
              </>
            ) : null}

            <Separator className="my-8" />
            <div className="flex w-full flex-1 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-8">
                  {formatNumber(key.roles.length)} Roles{" "}
                </Badge>
                <Badge variant="secondary" className="h-8">
                  {formatNumber(transientPermissionIds.size)} Permissions
                </Badge>
              </div>
              <RBACButtons permissions={key.workspace.permissions} />
            </div>
            <PermissionList roles={rolesList} keyId={key.id} />
          </div>
        </div>
      </PageContent>
    </div>
  );
}

function prepareInterval(interval: Interval) {
  const now = new Date();

  switch (interval) {
    case "24h": {
      const end = now.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
      const intervalMs = 1000 * 60 * 60 * 24;
      return {
        start: end - intervalMs,
        end,
        intervalMs,
        granularity: 1000 * 60 * 60,
        getVerificationsPerInterval: clickhouse.verifications.perHour,
      };
    }
    case "7d": {
      now.setUTCDate(now.getUTCDate() + 1);
      const end = now.setUTCHours(0, 0, 0, 0);
      const intervalMs = 1000 * 60 * 60 * 24 * 7;
      return {
        start: end - intervalMs,
        end,
        intervalMs,
        granularity: 1000 * 60 * 60 * 24,
        getVerificationsPerInterval: clickhouse.verifications.perDay,
      };
    }
    case "30d": {
      now.setUTCDate(now.getUTCDate() + 1);
      const end = now.setUTCHours(0, 0, 0, 0);
      const intervalMs = 1000 * 60 * 60 * 24 * 30;
      return {
        start: end - intervalMs,
        end,
        intervalMs,
        granularity: 1000 * 60 * 60 * 24,
        getVerificationsPerInterval: clickhouse.verifications.perDay,
      };
    }
    case "90d": {
      now.setUTCDate(now.getUTCDate() + 1);
      const end = now.setUTCHours(0, 0, 0, 0);
      const intervalMs = 1000 * 60 * 60 * 24 * 90;
      return {
        start: end - intervalMs,
        end,
        intervalMs,
        granularity: 1000 * 60 * 60 * 24,
        getVerificationsPerInterval: clickhouse.verifications.perDay,
      };
    }
  }
}
