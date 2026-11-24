# Safety and Limitations

> **Draft, in progress.** Only the data location section below has been written so far (with C14, 24 Nov 2026). The rest of this document is drafted by the documentation owner (plan section 13.1): the risk register, harm and benefit table, limits of the AI components, and the statement signed by Kara.

## Data location and cross-border transfer

**Decision (Kara, 24 Nov 2026):** the hosted system runs in Microsoft Azure's **South Africa North** region (Johannesburg). Azure has no region in Nigeria, and South Africa North is the closest one. Everything ElectraGuard stores is therefore held and processed outside Nigeria:
- reports
- observer codes
- photos, videos and voice notes
- transcripts
- the audit log
- backups

This applies to the Azure deployment only. The offline laptop stack (`docker compose up`) keeps everything on that machine.

### What stays in the region

These all live in South Africa North:
- the PostgreSQL database and its backups (geo-redundant backup is turned off)
- the private media share (zone-redundant storage, which replicates within the region only)
- Key Vault
- the container registry
- the log workspace

Speech transcription and face blurring run inside our own containers. No report data is sent to any other AI provider (plan section 6.1). Logs hold container output only; the application does not log report content.

### Basis under the Nigeria Data Protection Act 2023

Part VIII of the Act covers cross-border transfers (sections 41 to 43). Personal data may leave Nigeria only where:
- the recipient is bound by a law, binding corporate rules, contractual clauses, a code of conduct or a certification that gives an adequate level of protection, or
- another basis listed in section 43 applies, for example informed consent.

The controller must record the basis and its assessment of adequacy.

Our position, **to be confirmed with the legal and data-protection mentor clinic before any real data is used**:

1. **During the hackathon only synthetic data is processed.** No real person's data is transferred, so the transfer rules are not yet engaged. Every screen and document says the data is synthetic.
2. **For any later use with real observers**, the intended basis is adequacy under section 41(1):
   - South Africa's Protection of Personal Information Act 2013 (POPIA) is a comprehensive data protection law with an independent regulator.
   - Microsoft's Products and Services Data Protection Addendum includes contractual commitments on processing, security and sub-processors.
   - The transfer, its basis and the adequacy assessment must be recorded before go-live, and any guidance from the Nigeria Data Protection Commission must be checked.
3. **Data minimisation reduces what crosses the border:**
   - no names or GPS for observers
   - observer codes instead of identities
   - metadata stripped from all media
   - faces blurred on request, and blurred for reviewers by default
   - withdrawal deletes the report's content and media
4. **The privacy notice must say where data is held.** Observers and citizens must be told that their reports are stored in South Africa, at screen O-02 (privacy notice) and on the public pages. This needs the copy owner to add one line in all five languages.

### Changing the region

Changing `AZURE_LOCATION` in `deploy/azure/deploy.sh` changes where data is stored. Update this section first.
