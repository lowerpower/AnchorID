{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": "https://blog.mycal.net/about/#mycal",
      "identifier": {
        "@type": "PropertyValue",
        "propertyID": "canonical-uuid",
        "value": "urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c"
      },
      "name": "Mike Johnson",
      "alternateName": ["Mycal", "Michael Johnson"],
      "url": "https://blog.mycal.net/about/",
      "sameAs": [
        "https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c",
        "https://github.com/lowerpower",
        "https://music.mycal.net"
      ]
    },
    {
      "@type": "Organization",
      "@id": "https://anchorid.net/#org",
      "identifier": {
        "@type": "PropertyValue",
        "propertyID": "canonical-uuid",
        "value": "urn:uuid:4c785577-9f55-4a22-a80b-dd1f4d9b4658"
      },
      "name": "AnchorID",
      "alternateName": "AnchorID.net",
      "description": "A permanent attribution anchor for long-lived work. Durable, UUID-based attribution that survives platform changes and outlives any single service.",
      "url": "https://anchorid.net",
      "foundingDate": "2026-01-11",
      "founder": {
        "@id": "https://blog.mycal.net/about/#mycal"
      },
      "sameAs": [
        "https://anchorid.net/resolve/4c785577-9f55-4a22-a80b-dd1f4d9b4658",
        "https://github.com/lowerpower/AnchorID"
      ],
      "slogan": "Attribution as infrastructure, not a profile"
    },
    {
      "@type": "WebSite",
      "@id": "https://anchorid.net/#website",
      "name": "AnchorID",
      "url": "https://anchorid.net",
      "publisher": {
        "@id": "https://anchorid.net/#org"
      },
      "creator": {
        "@id": "https://blog.mycal.net/about/#mycal"
      },
      "copyrightYear": 2026,
      "copyrightHolder": {
        "@id": "https://anchorid.net/#org"
      },
      "inLanguage": "en"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://anchorid.net/#service",
      "name": "AnchorID Service",
      "applicationCategory": "Attribution Infrastructure",
      "operatingSystem": "Web",
      "description": "A UUID-based attribution service that provides permanent, machine-readable attribution anchors for long-lived work. Enables work and ideas to be attributed to the same enduring source across time, platforms, and system failures.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "provider": {
        "@id": "https://anchorid.net/#org"
      },
      "url": "https://anchorid.net",
      "potentialAction": [
        {
          "@type": "CreateAction",
          "name": "Create AnchorID",
          "description": "Create a permanent UUID-based attribution anchor",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://anchorid.net/create",
            "actionPlatform": [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform"
            ]
          }
        },
        {
          "@type": "SearchAction",
          "name": "Resolve AnchorID",
          "description": "Look up an identity by UUID",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://anchorid.net/resolve/{uuid}",
            "actionPlatform": [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform"
            ]
          }
        },
        {
          "@type": "UpdateAction",
          "name": "Edit Existing AnchorID",
          "description": "Update an existing AnchorID profile",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://anchorid.net/login",
            "actionPlatform": [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform"
            ]
          }
        }
      ],
      "featureList": [
        "UUID-based permanent identifiers",
        "Machine-readable JSON-LD identity records",
        "Website verification via .well-known/anchorid.txt",
        "DNS verification via TXT records",
        "GitHub profile verification",
        "Social profile verification",
        "Cryptographic proof of platform control",
        "Public claims ledger",
        "Email-based magic link authentication"
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://anchorid.net/#homepage",
      "name": "AnchorID - Permanent Attribution Anchor",
      "description": "A permanent attribution anchor for long-lived work. Durable, UUID-based attribution that survives platform changes and outlives any single service.",
      "url": "https://anchorid.net/",
      "isPartOf": {
        "@id": "https://anchorid.net/#website"
      },
      "about": {
        "@id": "https://anchorid.net/#service"
      },
      "mainEntity": {
        "@id": "https://anchorid.net/#service"
      },
      "publisher": {
        "@id": "https://anchorid.net/#org"
      },
      "significantLink": [
        "https://anchorid.net/create",
        "https://anchorid.net/login",
        "https://anchorid.net/about",
        "https://anchorid.net/guide",
        "https://anchorid.net/proofs",
        "https://anchorid.net/faq",
        "https://anchorid.net/privacy"
      ]
    }
  ]
}

