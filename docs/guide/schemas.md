# Typed schemas and historical data

The schema generator emits TypeScript read/write models and runtime bindings together. Field IDs are immutable storage identities. Aliases are pinned exported property names; re-exporting after an alias change creates a visible generated-code diff.

Read fields are nullable because old publications and owned records may use earlier definitions. Enum reads accept historical strings; enum writes accept only the active choices. Date and datetime values remain strings. Components map recursively with their own pinned field IDs. The runtime mapper checks primitive, component and cardinality shapes before returning typed data.

A write field is required exactly when it is neither optional nor conditional. Generated definitions include the presence of a condition, never its expression or default value. Required fields are checked by the server against the active definition on every write.

An entry's `meta.definitionId` identifies its actual read definition; `activeDefinitionId` and `schemaDigest` describe the active schema. A digest change is useful diagnostics, not permission to overwrite unknown values. Schema evolution may remain compatible for reads while requiring a new write model.

Owned sync persistence retains the lossless field-ID envelope before mapping it into your generated aliases. New IDs unknown to an installed app remain available for future remapping. They are never automatically echoed into replacement requests. Public/member mappings receive only the server-authorized fields.

For owned reads, historical kind or cardinality mismatches map to null in typed `data`; the lossless `raw` envelope remains available so one older record does not prevent sync. Malformed protocol envelopes still fail response validation. Do not coerce historical values with a TypeScript cast or copy `raw` into a replacement; migrate data through an authorized server workflow. Retyping a field requires a new immutable ID, including when a retired field ID would otherwise appear available.
