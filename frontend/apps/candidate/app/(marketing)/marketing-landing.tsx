import { MarketingNav } from "../../components/marketing/marketing-nav";
import { Hero } from "../../components/marketing/hero";
import { StatStrip } from "../../components/marketing/stat-strip";
import { DiffStrip } from "../../components/marketing/diff-strip";
import { HowItWorks } from "../../components/marketing/how-it-works";
import { MeritFlow } from "../../components/marketing/merit-flow";
import { FeatureColumns } from "../../components/marketing/feature-columns";
import { ValuePills } from "../../components/marketing/value-pills";
import { Testimonial } from "../../components/marketing/testimonial";
import { FinalCta } from "../../components/marketing/final-cta";
import { MarketingFooter } from "../../components/marketing/marketing-footer";

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <Hero />
        <StatStrip />
        <DiffStrip />
        <HowItWorks />
        <MeritFlow />
        <FeatureColumns />
        <ValuePills />
        <Testimonial />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
