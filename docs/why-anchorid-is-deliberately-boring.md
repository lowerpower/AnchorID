# Why AnchorID Is Deliberately Boring

Most identity systems fail not because they lack features, but because they assume the world will cooperate with them.

They assume platforms will remain stable. They assume registries will be funded forever. They assume cryptographic schemes will stay fashionable. They assume users will rotate keys, migrate wallets, or care enough to keep up.

History suggests otherwise.

---

## The Problem Isn’t Identity — It’s Time

The hardest part of identity is not authentication, reputation, or verification.

It is **continuity over time**.

Names change. Domains expire. Companies die. Blockchains fork. Social networks collapse or rebrand. Even well-intentioned systems accumulate technical debt, governance risk, and incentive drift.

Most identity projects optimize for *now*:

* fast onboarding
* strong cryptography
* elegant protocols
* impressive diagrams

Very few optimize for **still working in 20 or 50 years**.

AnchorID does.

---

## Boring Primitives Age Better

AnchorID is built from deliberately unexciting components:

* UUIDs
* HTTPS URLs
* Plain JSON
* schema.org vocabularies
* Public, human-readable proof files

These are not cutting-edge technologies. That is the point.

They are widely implemented, deeply archived, and extremely likely to remain interpretable long after today’s identity stacks are forgotten. A future system does not need AnchorID-specific software to understand an AnchorID record — it only needs a URL fetcher and a JSON parser.

That property is rare.

---

## Proof Over Permission

AnchorID does not grant identity. It does not authenticate users. It does not act as an authority.

Instead, it answers a simpler question:

> *“Can this person demonstrate continuity across independent systems?”*

A website proves control of a domain.
A GitHub README proves control of a developer identity.
A claims ledger shows when and how those proofs were observed.

Nothing is hidden. Nothing is implied. Consumers decide how much trust to assign.

This makes AnchorID composable with systems that do not exist yet.

---

## Decentralization Without Reinvention

Many decentralized identity systems introduce:

* new URI schemes
* new resolution layers
* new registries
* new cryptographic ceremonies

AnchorID does not.

It uses the web as it already exists. It assumes that URLs, archives, and crawlers will outlive most bespoke protocols. It treats decentralization as a property of *deployability and survivability*, not formal topology.

In practice, this makes AnchorID easier to mirror, archive, and re-host — including by people who have never heard of AnchorID.

That is a feature, not a limitation.

---

## Auditability Is the Point

AnchorID is designed to be understandable by:

* humans
* machines
* archivists
* adversaries

If an identity claim cannot be explained by pointing at a URL and saying “look, this is what it says,” it is not a strong claim.

This bias toward auditability trades off convenience, but it dramatically improves long-term reliability.

---

## Boring Systems Survive Their Creators

AnchorID assumes it will someday be abandoned.

That is not pessimism — it is engineering.

A good identity system should leave behind artifacts that remain useful even if:

* the original operator disappears
* the code is no longer maintained
* the documentation is lost

If all that remains is a UUID, a URL, and a JSON document, AnchorID has succeeded.

---

## The Goal

AnchorID is not trying to be the center of identity.

It is trying to be a **stable reference point** — something other systems can point at without fear that the meaning will drift.

That requires resisting novelty.
That requires saying no to features.
That requires being boring.

And that is exactly the point.

