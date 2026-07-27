import { ApplicantsLanding } from "./(marketing)/applicants-landing";
import { HomeClient } from "./page-client";

export default function Home() {
  // The landing is passed as children so it is part of the server render. HomeClient
  // previously returned null until mount, which meant `/` — the main acquisition and
  // SEO surface — served an empty body to crawlers and delayed LCP for everyone.
  return (
    <HomeClient>
      <ApplicantsLanding />
    </HomeClient>
  );
}
