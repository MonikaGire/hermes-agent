export function nofoalWaitlistEmail(_email: string): { subject: string; html: string } {
  const subject = "You're on the List. — NOFOAL";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>NOFOAL</title>
<style>
body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: nearest-neighbor; display: block; }
a img { border: none; }
p { margin: 0; padding: 0; }
table { border-collapse: collapse; width: 100%; }
td { padding: 0; }
/* Force all links to black — prevents iOS auto-link blue */
a { color: inherit !important; text-decoration: none !important; -webkit-text-fill-color: inherit !important; }
@media (prefers-color-scheme: dark) {
  .card-outer,
  .card-outer tr,
  .card-outer td  { background-color: #ffffff !important; color: inherit !important; }
  .sec-bg         { background-color: #f7f6f2 !important; }
  .card-outer     { border-color: #dedede !important; }
  .row-div        { border-bottom-color: #dedede !important; }
  .row-div-faint  { border-bottom-color: #ebebeb !important; }
  .dot-sep td     { border-bottom-color: #dedede !important; }
  .hero-line      { background-color: #dedede !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#edebe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','DM Sans',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" bgcolor="#edebe6" style="width:100%;background-color:#edebe6;border-collapse:collapse;">
<tr><td align="center" bgcolor="#edebe6" style="padding:44px 16px;">

<table role="presentation" style="width:100%;max-width:500px;margin:0 auto;border-collapse:collapse;">
<tr><td style="padding:0;">

<!-- Above card labels -->
<table role="presentation" style="width:100%;margin-bottom:14px;border-collapse:collapse;">
<tr>
<td style="padding:0 2px;font-size:9px;font-weight:400;letter-spacing:0.14em;text-transform:uppercase;color:#aaa;">nofoal · waitlist</td>
<td style="padding:0 2px;text-align:right;font-size:9px;font-weight:400;letter-spacing:0.14em;text-transform:uppercase;color:#aaa;">SS–26</td>
</tr>
</table>

<!-- Card container — 1px solid hex border, no rgba, no 0.5px -->
<table role="presentation" bgcolor="#ffffff" class="card-outer" style="width:100%;background-color:#ffffff;border-collapse:collapse;border:1px solid #dedede;">

<!-- Header / Logo -->
<tr bgcolor="#ffffff">
<td class="row-div" style="padding:22px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
  <tr bgcolor="#ffffff">
    <td style="padding:0;vertical-align:middle;">
      <!--[if !mso]><!-->
      <img src="https://nofoal.com/logo-b.png" alt="NOFOAL" width="80" height="51" style="display:block;width:80px;max-width:80px;height:auto;border:0;outline:none;text-decoration:none;" />
      <!--<![endif]-->
      <!--[if mso]>
      <table role="presentation" style="border-collapse:collapse;"><tr><td style="padding:0;font-size:18px;font-weight:700;letter-spacing:0.22em;color:#000000;">NOFOAL</td></tr></table>
      <![endif]-->
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Hero section -->
<tr bgcolor="#ffffff">
<td class="row-div" style="padding:44px 28px 38px;border-bottom:1px solid #dedede;">
  <div style="margin-bottom:18px;font-size:9px;font-weight:400;letter-spacing:0.22em;text-transform:uppercase;color:#888;">Now Live</div>
  <div style="margin-bottom:20px;font-size:34px;font-weight:500;line-height:1.2;letter-spacing:0.06em;text-transform:uppercase;color:#000000;">It's Here.<br/>Shop Now.</div>
  <div class="hero-line" style="width:36px;height:1px;background-color:#dedede;margin-bottom:20px;font-size:0;line-height:0;">&nbsp;</div>
  <p style="font-size:13px;font-weight:300;line-height:1.9;color:#888;max-width:320px;margin:0;">
    As a waitlist member, you're among the first to access the full collection — before it's gone.
  </p>
</td>
</tr>

<!-- Objects section header -->
<tr bgcolor="#f7f6f2">
<td bgcolor="#f7f6f2" class="sec-bg row-div" style="padding:13px 28px;border-bottom:1px solid #dedede;background-color:#f7f6f2;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="padding:0;font-size:9px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#888;">Objects</td>
    <td style="padding:0;text-align:right;font-size:9px;font-weight:300;letter-spacing:0.10em;color:#bbb;">9 available</td>
  </tr>
  </table>
</td>
</tr>

<!-- Object rows — plain text names (no <a> tags) prevent iOS blue-link auto-detection -->
<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Rigid Transit 27</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Rigid Transit 20</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Utility Flask 1500ml</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">Low Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Field Frame</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">Low Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Weather Module</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Core Pack</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Carry Sleeve</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div-faint" style="padding:15px 28px;border-bottom:1px solid #ebebeb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Transit Pouch</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">In Stock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div" style="padding:15px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:12px;font-weight:400;color:#000000;">Field Canteen 750ml</td>
    <td style="padding:0 8px;border-bottom:1px dotted #dedede;" width="48"></td>
    <td style="padding:0;text-align:right;font-size:8px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#888;white-space:nowrap;">Low Stock</td>
  </tr></table>
</td></tr>

<!-- Info rows -->
<tr bgcolor="#ffffff"><td class="row-div" style="padding:15px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:9px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#888;">Access Type</td>
    <td style="padding:0;text-align:right;font-size:10px;font-weight:300;letter-spacing:0.06em;color:#000000;">Waitlist · Early Entry</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div" style="padding:15px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:9px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#888;">Edition</td>
    <td style="padding:0;text-align:right;font-size:10px;font-weight:300;letter-spacing:0.06em;color:#000000;">Limited · No Restock</td>
  </tr></table>
</td></tr>

<tr bgcolor="#ffffff"><td class="row-div" style="padding:15px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="padding:0;font-size:9px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#888;">Shipping</td>
    <td style="padding:0;text-align:right;font-size:10px;font-weight:300;letter-spacing:0.06em;color:#000000;">Worldwide · Duties Included</td>
  </tr></table>
</td></tr>

<!-- Note box -->
<tr bgcolor="#ffffff">
<td class="row-div" style="padding:20px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;border:1px dashed #dedede;">
  <tr><td style="padding:16px 18px;font-size:12px;font-weight:300;line-height:1.75;color:#666;">
    <span style="font-weight:500;color:#000000;">Once it's gone, it's gone.</span> These are numbered editions — no reprints, no restocks. What you see is everything there is.
  </td></tr>
  </table>
</td>
</tr>

<!-- Body note -->
<tr bgcolor="#ffffff">
<td class="row-div" style="padding:28px;border-bottom:1px solid #dedede;">
  <p style="font-family:Georgia,serif;font-size:16px;font-weight:300;font-style:italic;line-height:1.95;color:#888;margin:0;">
    Compatible objects are available separately to expand your carry system.
  </p>
</td>
</tr>

<!-- CTA buttons -->
<tr bgcolor="#ffffff">
<td class="row-div" style="padding:22px 28px;border-bottom:1px solid #dedede;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="padding:0;padding-right:10px;">
      <a href="https://nofoal.com/products.html" style="display:block;background-color:#000000;color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;text-align:center;padding:16px 10px;font-size:10px;font-weight:500;letter-spacing:0.20em;text-transform:uppercase;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Shop</a>
    </td>
    <td style="padding:0;">
      <a href="https://nofoal.com" style="display:block;background-color:#ffffff;color:#000000 !important;-webkit-text-fill-color:#000000 !important;text-align:center;padding:16px 18px;font-size:10px;font-weight:400;letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;border:1px solid #cccccc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">Visit Store</a>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Footer -->
<tr bgcolor="#ffffff">
<td style="padding:16px 28px 26px;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="padding:0;font-size:9px;font-weight:300;letter-spacing:0.14em;text-transform:uppercase;color:#bbb;">&#169; 2026 nofoal</td>
    <td style="padding:0;text-align:right;">
      <a href="https://nofoal.com" style="font-size:9px;font-weight:300;letter-spacing:0.12em;text-transform:uppercase;color:#bbb !important;-webkit-text-fill-color:#bbb !important;text-decoration:none;">nofoal.com</a>
    </td>
  </tr>
  </table>
</td>
</tr>

</table>

<!-- Below card label -->
<table role="presentation" style="width:100%;margin-top:12px;border-collapse:collapse;">
<tr>
<td style="padding:0 2px;font-size:8px;font-weight:300;letter-spacing:0.14em;text-transform:uppercase;color:#aaa;">nofoal · objects of intention</td>
</tr>
</table>

</td></tr>
</table>

</td></tr>
</table>

</body>
</html>`;

  return { subject, html };
}
