# Historical and professional deep-sky catalogues: content and licensable data sources

Scope: what each catalogue amateurs use contains, and which machine-readable source a closed-source commercial PWA could ship (positions, magnitudes, sizes, designations). The app already ships Messier, NGC/IC (OpenNGC, CC-BY-SA, own file), Caldwell, bright WDS doubles, named stars and planets. Researched 2026-11-11. Not legal advice.

Note on method: about 20 searches and fetches. Several primary licence pages failed to load: the CDS licence page returned 404 or DNS errors, and the HyperLEDA site refused the connection. Facts marked "(background knowledge, not verified this session)" come from the researcher's prior knowledge and need checking before anyone relies on them.

## 1. Catalogues: size, object types, amateur interest, authoritative source

### Takeaway
Most of these catalogues are old, small tables (from 1920s to 1960s papers) that VizieR/CDS hosts, and many also sit in NASA's HEASARC. HEASARC copies are US Government works and are the cleanest licence route. Modern open-cluster catalogues built on Gaia, such as Cantat-Gaudin 2020 and Hunt & Reffert 2023, replace Dias for positions, but they don't cover every historical name.

### Cited Findings
- Lynds' Catalog of Bright Nebulae (LBN) is on HEASARC (`lbn` table). Its fields are: centre RA/Dec, galactic l/b, largest and smallest dimensions in arcmin, area in deg², a colour index (1–4), a brightness scale (1–6, where 1 is brightest; there is no magnitude), an association ID, and cross-references to NGC, IC, Sharpless 1959, Cederblad and Dorschner & Gürtler. The source is Lynds 1965, ApJS 12, 163. CDS corrected it and added sequence numbers, and HEASARC revised it in February 2001. The page states no licence or data-use terms. — [HEASARC LBN](https://heasarc.gsfc.nasa.gov/W3Browse/all/lbn.html)
- The same HEASARC page cites VizieR VII/20 for Sharpless (1959). — [HEASARC LBN](https://heasarc.gsfc.nasa.gov/W3Browse/all/lbn.html)
- OpenNGC takes its nebula dimensions from the HEASARC `lbn` table. — [OpenNGC README](https://github.com/mattiaverga/OpenNGC)
- Harris catalogue of Milky Way globular clusters, December 2010 edition: about 157 clusters, Palomar globulars included (the count is background knowledge, not verified this session). HEASARC (`globclust`) and McMaster both host it. The 2010 revision is "the biggest single revision since the original version". — [arXiv 1012.3224](https://arxiv.org/abs/1012.3224); [HEASARC globclust](https://heasarc.gsfc.nasa.gov/W3Browse/catalog/globclust.html); [Harris databases page](https://physics.mcmaster.ca/Fac_Harris/Databases.html)
- Cantat-Gaudin et al. 2020, A&A 640, A1, "Painting a portrait of the Galactic disc with its stellar clusters": parameters for about 2000 Gaia DR2 clusters, reliable for 1867. It is VizieR J/A+A/640/A1, with table1 holding the mean cluster parameters and a members table. — [GAVO registry record](https://dc.g-vo.org/rr/q/lp/custom/CDS.VizieR/J/A+A/640/A1); [INAF open access](https://openaccess.inaf.it/entities/publication/5b6e8020-79cc-483c-b95b-8aefd2b79b11)
- Stellarium's DSO catalogue has more than 94,000 objects and credits Wolfgang Steinicke. Its cross-index data comes partly from a 2003 paper and from astronomical databases. — [Stellarium guide ch_dso.tex (Debian sources)](https://sources.debian.org/src/stellarium/25.4-1/guide/ch_dso.tex)

### Inferences (catalogue summary, mostly background knowledge, not verified this session; check VizieR IDs before use)

| Catalogue | Objects | Types / amateur interest | Likely authoritative machine-readable source |
| --- | --- | --- | --- |
| Arp, Atlas of Peculiar Galaxies (1966) | 338 | Interacting and peculiar galaxies, a popular observing challenge | VizieR VII/192 (Arp list with positions); HEASARC `arp` table may exist |
| Abell galaxy clusters (ACO 1989) | 4,073 (2,712 from Abell 1958 in the north, plus southern clusters) | Galaxy clusters. Only a few dozen are realistic for amateurs (e.g. Abell 426, 1656, 2151) | VizieR VII/110A (ACO); HEASARC `abell` |
| Abell planetary nebulae (1966) | 86 | Faint, large PNe; a challenge list (Abell 21, 31, 39, 426...) | Original paper Abell 1966, ApJ 144, 259. Better: the Strasbourg-ESO PN catalogue (VizieR V/84) or HASH (licence unclear) |
| Collinder (1931) | 471 | Open clusters, many large and binocular-friendly (Cr 399 "Coathanger") | Original Collinder 1931 (Lund Ann.). Positions are best taken from Dias 2002 (VizieR B/ocl), Kharchenko MWSC (J/A+A/558/A53) or Cantat-Gaudin 2020, which keep the Collinder names |
| Melotte (1915) | 245 | Clusters, including Mel 20 (Alpha Per), Mel 25 (Hyades), Mel 111 (Coma) | As for Collinder; names cross-matched in Dias and MWSC |
| Stock (1950s) | about 24 | Sparse open clusters | Dias, MWSC, Cantat-Gaudin |
| Trumpler (1930) | 37 | Open clusters | Dias, MWSC, Cantat-Gaudin |
| Harvard, Ruprecht, King, Berkeley | about 21, 176, 27, about 104 | Mostly faint open clusters, a challenge list | Dias B/ocl, MWSC, Cantat-Gaudin 2020, Hunt & Reffert 2023 (J/A+A/673/A114) |
| Barnard dark nebulae (1927) | 349 (some lists 370 with additions) | Dark nebulae, with an opacity class and no magnitude; B33 (Horsehead), B72 (Snake), B86 | VizieR VII/220A (Barnard, cleaned by Dobbs/SEDS?, check) |
| Lynds Dark Nebulae (LDN 1962) | 1,802 | Dark clouds, opacity 1–6, no magnitude; a few are amateur targets | VizieR VII/7A; HEASARC `ldn` |
| Lynds Bright Nebulae (LBN 1965) | 1,125 | Emission and reflection nebulae, brightness class 1–6 | VizieR VII/9; HEASARC `lbn` (confirmed above) |
| Sharpless Sh2 (1959) | 313 | H II regions; large amateur list, mostly for imaging and narrowband | VizieR VII/20 (confirmed cited on HEASARC) |
| van den Bergh vdB (1966) | 158 | Reflection nebulae | VizieR VII/21 |
| Hickson Compact Groups (1982) | 100 groups | Galaxy groups (HCG 92 = Stephan's Quintet); a challenge list | VizieR VII/213 (Hickson 1993); HEASARC `hcg` |
| Palomar globulars | 15 | Faint globulars (Pal 5, Pal 12...) | Harris 2010 (HEASARC `globclust`) |
| UGC (Nilson 1973) | 12,921 | Northern galaxies to 14.5 mag or 1 arcmin | VizieR VII/26D; HEASARC `ugc` |
| PGC / HyperLEDA | millions | Galaxies | HyperLEDA (VizieR VII/237 for PGC 2003); licence below |
| Gum (1955) | 85 | Southern H II regions | Original Gum 1955 Mem. RAS; VizieR (ID not found) |
| RCW (1960) | 182 | Southern H-alpha regions | VizieR VII/216 (check) |
| Others often seen on amateur lists | — | Herschel 400 and Herschel II (subsets of NGC, already covered by OpenNGC); RASC Finest NGC; SAC 110; Cederblad (Ced, 330 bright nebulae, VizieR VII/231?); Dolidze, Dolidze-Dzimselejsvili (Do, DoDz) and Alessi clusters; Minkowski PNe (M1-, M2-...); Pease 1 PN; Terzan globulars; ESO galaxies | — |

- Practical: nearly all VizieR/HEASARC copies give positions in J2000 (VizieR recomputes "_RAJ2000/_DEJ2000" for older B1950 tables), but the originals of Barnard, Collinder, Melotte, Sharpless, LDN, LBN and vdB were B1950 or earlier. Always take the J2000 columns or precess.
- Magnitudes: dark nebulae (B, LDN) have only an opacity class. LBN has only a brightness class (1–6). Sharpless has a brightness class (1–3) and diameter. Clusters from Gaia catalogues have no integrated V magnitude (Kharchenko MWSC gives some integrated magnitudes). Galaxy catalogues (UGC, Arp via cross-match, HCG) have photographic or total magnitudes. Plan the UI so that "no magnitude" sorts or filters sensibly.

### Gaps
- Exact object counts and VizieR IDs in the table are unverified this session (only VII/20 Sharpless and J/A+A/640/A1 were confirmed in sources). Check each on VizieR before writing the import scripts.
- Which HEASARC tables exist for each (arp, ldn, hcg, abell, ugc, sharpless) was not verified beyond `lbn` and `globclust`.

## 2. Licence and terms of each source

### Takeaway
NASA HEASARC catalogues are listed as US Government works (public domain in the US). That makes them the safest bulk source for the old catalogues, with an acknowledgement. CDS/VizieR says access is free "essentially for scientific use", and commercial use depends on each dataset's origin. Treat VizieR as needing a per-catalogue check, and prefer the HEASARC copy of the same table. Stellarium's DSO data should be avoided: the package is GPL-2+ and the data file has no separate licence.

### Cited Findings
- CDS "Rules of usage of VizieR data": VizieR gives free access to catalogue data, essentially for scientific use. Commercial use follows rules that depend on each dataset's origin. Users should acknowledge the service, and the information system (metadata included) is private and reserved to CDS. (Search snippet; the page itself failed to load.) — [CDS rules of usage](https://cds.u-strasbg.fr/vizier-org/licences_vizier.html)
- Other sources conflict on a VizieR-wide licence: FAIRsharing lists CC BY-SA 4.0, and a CASRAI guide lists CC-BY. Neither is authoritative for individual catalogues. — [FAIRsharing VizieR](https://fairsharing.org/2755); [CASRAI CDS guide](https://casrai.org/guides/cds-strasbourg-vizier-simbad-aladin)
- The Cantat-Gaudin 2020 DOI record (10.26093/cds/vizier.36400001) points its rights field at the CDS VizieR licences page, not at an explicit CC-BY. — [GAVO record](https://dc.g-vo.org/I/ivo://CDS.VizieR/J/A+A/640/A1)
- VizieR asks users to cite DOI 10.26093/cds/vizier and the 2000 A&AS paper. Some catalogue ReadMes add an "Acknowledging" section. — [VizieR cite page](https://vizier.cfa.harvard.edu/viz-bin/cite/J/ApJS/192/1)
- Harris globular cluster catalogue on data.gov, published by HEASARC/NASA: licence "https://www.usa.gov/government-works", access level public. Citation requested: "Harris 1996 (2010 edition)". The author's page also asks for Harris, Harris & Alessi 2013, ApJ 772, 82. — [data.gov Harris](https://catalog.data.gov/dataset/milky-way-globular-clusters-catalog-december-2010-version); [Harris databases page](https://physics.mcmaster.ca/Fac_Harris/Databases.html)
- The HEASARC LBN page shows no licence beyond general NASA notices. — [HEASARC LBN](https://heasarc.gsfc.nasa.gov/W3Browse/all/lbn.html)
- NED asks for an acknowledgement ("funded by NASA under Award 80NSSC21M0037 and operated by Caltech"). I found no explicit commercial-use term. A third-party catalogue (ComPADRE) lists NED as having no copyright, licence or use restriction, but that is not NED's own statement. The NED legacy APIs cannot reach data ingested after January 2026. — [NED acknowledgements](https://ned.ipac.caltech.edu/Documents/Overview/Acknowledgments); [ComPADRE listing](https://www.compadre.org/Student/items/detail.cfm?ID=69); [NED intro](https://ned.ipac.caltech.edu/help/intro.html)
- HyperLEDA: a 2012 Stellarium blueprint quotes HyperLEDA as saying its data "can be freely used" and its software is GPL. I could not reach HyperLEDA's own site to confirm (connection refused). — [Stellarium blueprint](https://blueprints.launchpad.net/stellarium/+spec/stellarium-dso-catalog)
- Stellarium: the Debian copyright file covers the whole package with `Files: *` under GPL-2+, and has no separate stanza for `nebulae/default/catalog.dat`. — [Debian stellarium copyright](https://sources.debian.org/src/stellarium/24.3-1/debian/copyright)
- OpenNGC is CC-BY-SA-4.0. — [OpenNGC README](https://github.com/mattiaverga/OpenNGC)
- Wikidata main-namespace data is CC0. — [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)
- SAC Deep Sky Database 8.1 (March 2010) was announced as available "to the world for free". The older version 5.0 documentation says "released for private use" and "Please do not sell this database in any form". I found no formal licence for 8.1. — [SAC downloads](https://www.saguaroastro.org/sac-downloads/); [SAC forum 8.1 announcement](https://www.freelists.org/post/sac-forum/SAC-deepsky-data-ver-81-ready,1); [SAC 5.0 sacdoc.txt](https://discmaster.textfiles.com/view/11575/FishMarket%20v1.0.iso/fishies/201-225/disk_219/deepsky/sac50.zoo/sacdoc.txt)
- d3-celestial code is BSD-3-Clause. Its `dsos.*.json` data comes from SAC 8.1, with no separate data licence stated. — [d3-celestial](https://github.com/ofrohn/d3-celestial)

### Inferences
- **Safest:** HEASARC tables (NASA, US Government work) for LBN, Harris and, if present, LDN, Sharpless, Abell, Arp, HCG and UGC. Ship them with an acknowledgement of HEASARC and the original paper. "US Government work" is public domain in the US; elsewhere, NASA doesn't normally assert copyright, but the original authors' rights in the table compilation are uncertain (see Gaps).
- **VizieR:** not a blanket open licence. The scientific-use wording and "commercial use depends on origin" make it ambiguous for a commercial app. Use VizieR to find and check data, but prefer the HEASARC copy of the same table, or a CC-BY Gaia catalogue whose paper is open access.
- **Facts versus database right:** an object's position and size are facts and are generally not copyrightable. The EU sui generis database right could still apply to a substantial extraction from a European-maintained database (CDS in France, HyperLEDA in France). That is a reason to prefer NASA copies, or to rebuild lists from several sources. This is a legal uncertainty, not a confirmed risk.
- **Avoid:** Stellarium `catalog.dat` (GPL-2+ package). SAC (no resale, "private use" wording; d3-celestial's DSO data inherits SAC's terms, not BSD). HASH PN database (terms not checked). Steinicke's Revised NGC (terms not checked; OpenNGC already covers NGC/IC).
- **Cantat-Gaudin 2020 / Hunt & Reffert 2023:** A&A papers since about 2022 are often open access under CC-BY, but the VizieR rights field points at the generic CDS page. Treat these as "likely OK with attribution, confirm with the A&A article licence and the ESA Gaia data licence (Gaia data is CC BY-SA 3.0 IGO per ESA, background knowledge, not verified)". **Flag:** if the Gaia-derived cluster tables inherit Gaia's CC BY-SA IGO, they would be copyleft and could not be merged into closed data. Verify this before use.

### Gaps
- The CDS licence page text could not be fetched directly (404 and DNS errors), so the exact current wording, including any CC-BY/ODbL adoption by 2026, is unconfirmed.
- HyperLEDA's own terms could not be fetched.
- AAS journal (ApJ, AJ, ApJS) table reuse policy was not researched in the time available. Background knowledge: AAS journals have been open access under CC-BY 4.0 since 2022, but older papers (Lynds 1962/1965, Abell 1958/1966, Arp 1966) are AAS copyright. Facts extracted from them are still likely usable. Unverified.
- The Gaia data licence and the A&A open-access licence for specific papers were not checked this session.

## 3. OpenNGC addendum and existing permissive compiled databases

### Takeaway
The OpenNGC addendum is small (64 objects). It includes a few Melotte, Harvard, Hickson, Barnard and Collinder entries, but no Sharpless, so it can't replace dedicated catalogue sources, and anything taken from it stays CC-BY-SA in the separate file. Wikidata (CC0) is the only permissive multi-catalogue compilation confirmed. Its astronomy coverage and quality vary, so it suits cross-identification and names more than primary positions.

### Cited Findings
- OpenNGC `addendum.csv` holds 64 objects: 33 ESO, 6 Mel (022, 071, 072, 101, 105, 111), 5 PGC, 4 C (Caldwell 9, 14, 41, 99), 4 H (H05, H13, H20, H21, apparently Harvard clusters), 3 UGC, 3 MWSC, 2 HCG (079, 092), 2 M (M40, M102), 1 B (B033 Horsehead), 1 Cl (Cl399). There are no Sh2 entries. — [OpenNGC addendum.csv](https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv)
- The README describes the addendum as objects "not part of the NGC or IC catalog" that interest amateurs (e.g. M40, M45). It has a prefix-conversion table for B, C, Cl and Mel names and uses HEASARC LBN for nebula dimensions. — [OpenNGC README](https://github.com/mattiaverga/OpenNGC)
- Wikidata structured data is CC0. — [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)
- d3-celestial's DSO JSON is SAC-derived, so it is not a permissive alternative despite the BSD code. — [d3-celestial](https://github.com/ofrohn/d3-celestial)

### Inferences
- Recommended pipeline for the app's `scripts/`: for each list, download the HEASARC table (public domain) or a confirmed CC-BY table, convert it to J2000 JSON in its own asset file, and add the credit in Settings next to OpenNGC's. Use Wikidata (CC0) for common names and cross-IDs such as "Sh2-155 = Cave Nebula". For clusters with historical names (Collinder, Melotte, Stock, Trumpler, King, Berkeley, Ruprecht, Harvard), take the names and positions from a public-domain or CC-BY cluster table that keeps those designations. Dias 2002 (VizieR B/ocl) does, but its licence is VizieR-generic. Check whether HEASARC mirrors it (HEASARC `openclust` is believed to be the Dias catalogue; background knowledge, verify).
- Many objects on these lists that are also NGC/IC (e.g. Cr 399 is not NGC, but Mel 111 is not NGC either; many Sh2 regions are NGC nebulae) can be linked to existing OpenNGC entries by ID without copying OpenNGC data into new files. That keeps the CC-BY-SA data separate.
- NED could be a fallback for galaxies (Arp, HCG, UGC) since it is NASA-funded, but it has no explicit licence, and its bulk use is through APIs. Prefer HEASARC tables.

### Gaps
- Whether HEASARC hosts Sharpless, LDN, vdB, Barnard, Arp, HCG, Abell, UGC, Collinder and Dias tables was not individually confirmed (only `lbn` and `globclust`).
- No permissive (CC0/CC-BY) curated amateur DSO compilation beyond Wikidata was found. Other possible candidates (e.g. the KStars data files under GPL, Cartes du Ciel catalogues, the NGC/IC Project) were not checked and are likely copyleft or unclear.
