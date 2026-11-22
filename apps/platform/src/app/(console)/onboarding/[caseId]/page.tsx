import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingCasePage({ params }: PageProps<"/onboarding/[caseId]">) {
  const { caseId } = await params;
  return <OnboardingWizard caseId={caseId} />;
}
