export const metadata = {
  title: "Pre-IPO Dashboard · HyperCore",
  description: "Real-time pre-IPO perpetual markets on Hyperliquid, powered by GoldRush HIP-3 streaming.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0d1117" }}>{children}</body>
    </html>
  );
}
