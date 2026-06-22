# Architecture Tab

## Summary

Cruise Line now includes an Architecture tab alongside Analysis and Chat. The tab helps reviewers understand the system design behind a pull request by combining a short architecture walkthrough with Mermaid diagrams generated during the existing analysis run.

## Design

The walkthrough schema now carries an `architecture` section in the same structured model response as the summary, verdict, and findings. This keeps the diagrams consistent with the review context without adding a second analysis request.

The architecture payload contains an overview, a short reading path, and one or two Mermaid diagrams. A flowchart is always generated, with orientation chosen from the feature shape. A sequence diagram is generated only when the PR changes a multi-actor runtime interaction.

The frontend renders this payload as a third tab. Mermaid source is rendered in-place for visual scanning, and each diagram includes a copy action for taking the raw Mermaid source elsewhere.

## Migration

No user action is required. Existing analyses can be regenerated to populate the Architecture tab.
