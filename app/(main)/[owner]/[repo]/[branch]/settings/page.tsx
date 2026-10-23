import { encodeBranch } from "@/lib/utils/branch";
import { redirect } from "next/navigation";

export default async function Page(
  props: Readonly<{
    params: Promise<{ owner: string; repo: string; branch: string }>;
  }>,
) {
  const params = await props.params;
  redirect(`/${params.owner}/${params.repo}/${encodeBranch(params.branch)}/configuration`);
}
