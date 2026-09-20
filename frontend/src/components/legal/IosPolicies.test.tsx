import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { IosPrivacyPolicy, IosRefundPolicy, IosTerms } from "./IosPolicies";
import { isPublicPath } from "@/components/AuthStateGuard";

afterEach(cleanup);
it.each([IosPrivacyPolicy, IosTerms, IosRefundPolicy])("keeps Apple policy pages relevant and links within the same edition", Component => {
  const { container } = render(<Component />);
  expect(container.textContent).not.toMatch(/android|google play|health connect|play store/i);
  expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy/ios");
  expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms/ios");
  expect(screen.getByRole("link", { name: "Refunds" })).toHaveAttribute("href", "/refund-policy/ios");
});
it("keeps the recipient, consent choices and provider protections in the privacy disclosure", () => {
  render(<IosPrivacyPolicy />);
  expect(screen.getByText(/Google Gemini, provided by Google/)).toBeInTheDocument();
  expect(screen.getByText(/same or equal protection/)).toBeInTheDocument();
  expect(screen.getByText(/AI sharing is optional and off until/)).toBeInTheDocument();
  expect(screen.getByText(/Food photos and meal descriptions/)).toBeInTheDocument();
});
it.each(["/privacy/ios", "/terms/ios", "/refund-policy/ios"])("allows opening %s before sign-in or consent", path => {
  expect(isPublicPath(path)).toBe(true);
});
