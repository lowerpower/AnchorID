# docs/proofs/dns.md

# DNS Proof (Domain Control)

DNS proof lets you prove you control a domain by publishing a DNS TXT record that
contains your AnchorID UUID.

This is a **domain-control** proof. It does not prove legal identity.

---

## Recommended setup (most common)

### 1) Add a TXT record

**Name / Host**
`_anchorid`

**Type**
`TXT`

**Value**
`anchorid=urn:uuid:<your-uuid>`

Example:
`anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c`

This creates a TXT record at:
`_anchorid.example.com`

### 2) Wait for DNS to propagate
Depending on your DNS provider, this can take from a minute to an hour.

### 3) Verify in AnchorID
In AnchorID, choose **DNS Proof**, enter your domain (example.com), and click Verify.

---

## Optional: Apex TXT method

If your DNS provider cannot create `_anchorid` records, you may place the TXT record
at the domain apex instead:

**Name / Host**
`@` (or blank, depending on provider)

**Type**
`TXT`

**Value**
`anchorid=urn:uuid:<your-uuid>`

Note: Apex TXT often already contains SPF/DKIM/DMARC-related records. The `_anchorid`
method is preferred.

---

## Troubleshooting

### Self-Check (Command Line)

**Pro-Tip:** Verify your DNS record yourself before clicking "Verify" in AnchorID.

Open your terminal and run:

```bash
dig +short TXT _anchorid.example.com
```

Replace `example.com` with your actual domain. You should see output like:

```
"anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c"
```

**If you don't see your UUID in the output, AnchorID won't be able to see it either!**

Alternative using `nslookup`:
```bash
nslookup -type=TXT _anchorid.example.com
```

### "No TXT records found"
- Confirm the record exists at `_anchorid.<domain>` (recommended) or at apex (if you chose apex).
- Confirm you saved/published the DNS changes in your provider.
- Try again after a few minutes (propagation delay).

### "TXT record found but doesn't match"
AnchorID looks for a value that includes your UUID. The recommended value is:

`anchorid=urn:uuid:<your-uuid>`

Make sure:
- UUID is correct
- no extra characters were added
- you did not paste smart quotes

### Long TXT records
Some DNS tools split long TXT values into multiple quoted strings. AnchorID supports this.
For DNS proof, keep the record short and simple.

---

## What DNS proof is good for

- Organizations (strong signal)
- Software projects tied to a domain (strong signal)
- Personal domains (good signal)

DNS proof is most valuable when paired with a website proof:
- `/.well-known/anchorid.txt`




