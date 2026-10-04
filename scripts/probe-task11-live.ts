async function verifyLiveClaims() {
  // 1. Landing Page HTML check
  const landingRes = await fetch('http://127.0.0.1:3001/');
  const landingHtml = await landingRes.text();

  const hasUntruthfulBanner = landingHtml.includes('A2P 10DLC registered with full TCPA quiet hours protection');
  const hasUntruthfulBadge = landingHtml.includes('TCPA &amp; 10DLC Compliant') || landingHtml.includes('TCPA & 10DLC Compliant');
  const hasHonestBanner = landingHtml.includes('10DLC registration support — brand and campaign submitted through The Campaign Registry as part of onboarding');
  const hasHonestBadge = landingHtml.includes('10DLC Registration Support');

  console.log('LIVE 1 - Landing page untruthful "10DLC registered" banner present:', hasUntruthfulBanner);
  console.log('LIVE 2 - Landing page untruthful "10DLC Compliant" badge present:', hasUntruthfulBadge);
  console.log('LIVE 3 - Landing page honest derived banner present:', hasHonestBanner);
  console.log('LIVE 4 - Landing page honest derived badge present:', hasHonestBadge);

  // 2. Compliance Page HTML check
  const compRes = await fetch('http://127.0.0.1:3001/compliance');
  const compHtml = await compRes.text();

  const hasUntruthfulCompBadge = compHtml.includes('Carrier Verified Telecom Architecture');
  const hasHonestCompBadge = compHtml.includes('10DLC Registration Support in Onboarding');
  const hasHonestArchitectureHeader = compHtml.includes('Telecommunications &amp; TCPA Compliance Architecture') || compHtml.includes('Telecommunications & TCPA Compliance Architecture');

  console.log('LIVE 5 - Compliance page untruthful "Carrier Verified" badge present:', hasUntruthfulCompBadge);
  console.log('LIVE 6 - Compliance page honest derived badge present:', hasHonestCompBadge);
  console.log('LIVE 7 - Compliance page updated architecture header present:', hasHonestArchitectureHeader);
}

verifyLiveClaims().catch(console.error);
