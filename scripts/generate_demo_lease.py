"""Generate a realistic synthetic UK commercial lease PDF for demos.

Fictional parties and address. Modelled on a standard UK FRI retail lease
(Code for Leasing Business Premises 2020 conventions).

Run:  python scripts/generate_demo_lease.py
Out:  leases/Olive_and_Vine_lease_2022.pdf
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


OUT = Path(__file__).resolve().parents[1] / "leases" / "Olive_and_Vine_lease_2022.pdf"


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontSize=16, spaceAfter=18, alignment=1
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], fontSize=11, spaceBefore=10, spaceAfter=4
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            spaceAfter=6,
            alignment=4,  # justify
        ),
        "small": ParagraphStyle(
            "small", parent=base["BodyText"], fontSize=9, leading=12, spaceAfter=4
        ),
    }


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=2.2 * cm,
        rightMargin=2.2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Lease — 14 Crouch End Broadway",
        author="LeaseOS demo",
    )
    s = build_styles()
    story = []

    # ---- Cover page ------------------------------------------------------
    story += [
        Paragraph("DATED 1 May 2022", s["title"]),
        Spacer(1, 0.4 * cm),
        Paragraph("(1) PATEL HOLDINGS LIMITED", s["h2"]),
        Paragraph("(2) OLIVE &amp; VINE LIMITED", s["h2"]),
        Paragraph("(3) ANNA MARINI", s["h2"]),
        Spacer(1, 1 * cm),
        Paragraph("LEASE", s["title"]),
        Paragraph("of", s["body"]),
        Paragraph(
            "the ground floor and basement at <b>14 Crouch End Broadway, London N8 8DT</b>",
            s["body"],
        ),
        Spacer(1, 1 * cm),
        Paragraph("Term: 10 years from and including 1 May 2022", s["body"]),
        Paragraph("Initial Rent: £42,500 per annum exclusive", s["body"]),
        PageBreak(),
    ]

    # ---- Parties & recitals ---------------------------------------------
    story += [
        Paragraph("THIS LEASE is made on 1 May 2022", s["body"]),
        Paragraph("BETWEEN:", s["h3"]),
        Paragraph(
            "(1) <b>PATEL HOLDINGS LIMITED</b> (company number 09245187) whose registered office "
            "is at 28 Highgate Hill, London N19 5NL (the &ldquo;Landlord&rdquo;);",
            s["body"],
        ),
        Paragraph(
            "(2) <b>OLIVE &amp; VINE LIMITED</b> (company number 13442019) whose registered office "
            "is at 14 Crouch End Broadway, London N8 8DT (the &ldquo;Tenant&rdquo;); and",
            s["body"],
        ),
        Paragraph(
            "(3) <b>ANNA MARINI</b> of 4 Park Avenue North, London N8 7RU (the &ldquo;Guarantor&rdquo;).",
            s["body"],
        ),
        Paragraph("RECITALS", s["h3"]),
        Paragraph(
            "(A) The Landlord is the freehold owner of the building known as 14 Crouch End "
            "Broadway, London N8 8DT registered at HM Land Registry under title number "
            "NGL542318.",
            s["body"],
        ),
        Paragraph(
            "(B) The Landlord has agreed to grant and the Tenant has agreed to accept a "
            "lease of the Premises on the terms set out in this deed. The Guarantor has "
            "agreed to guarantee the obligations of the Tenant.",
            s["body"],
        ),
        # ---- Definitions
        Paragraph("1. DEFINITIONS AND INTERPRETATION", s["h2"]),
        Paragraph("1.1 In this Lease the following definitions apply:", s["body"]),
        Paragraph(
            "<b>&ldquo;Premises&rdquo;</b> means the ground floor and basement of the Building "
            "known as 14 Crouch End Broadway, London N8 8DT, having a net internal area of "
            "approximately 1,250 square feet (116.1 sq m), shown edged red on the Plan annexed.",
            s["body"],
        ),
        Paragraph(
            "<b>&ldquo;Term&rdquo;</b> means the term of 10 years commencing on and including "
            "1 May 2022 and expiring on 30 April 2032.",
            s["body"],
        ),
        Paragraph(
            "<b>&ldquo;Initial Rent&rdquo;</b> means the sum of FORTY-TWO THOUSAND FIVE HUNDRED "
            "POUNDS (£42,500) per annum exclusive of VAT.",
            s["body"],
        ),
        Paragraph(
            "<b>&ldquo;Review Date&rdquo;</b> means each fifth anniversary of the commencement "
            "of the Term, being 1 May 2027.",
            s["body"],
        ),
        Paragraph(
            "<b>&ldquo;Permitted Use&rdquo;</b> means use as a restaurant and café within "
            "Use Class E(b) of the Town and Country Planning (Use Classes) Order 1987 "
            "(as amended).",
            s["body"],
        ),
        Paragraph(
            "<b>&ldquo;Rent Deposit&rdquo;</b> means the sum of £10,625 (being three months "
            "rent) held by the Landlord pursuant to a separate Rent Deposit Deed of even "
            "date.",
            s["body"],
        ),
        PageBreak(),
        # ---- Demise & term
        Paragraph("2. DEMISE", s["h2"]),
        Paragraph(
            "2.1 In consideration of the rents reserved and the covenants on the part of "
            "the Tenant contained in this Lease, the Landlord HEREBY DEMISES to the Tenant "
            "ALL THAT the Premises TO HOLD the same unto the Tenant for the Term.",
            s["body"],
        ),
        Paragraph("3. TERM", s["h2"]),
        Paragraph(
            "3.1 The Term shall commence on 1 May 2022 and shall expire on 30 April 2032 "
            "unless determined earlier in accordance with the provisions of this Lease.",
            s["body"],
        ),
        # ---- Rent
        Paragraph("4. RENT", s["h2"]),
        Paragraph(
            "4.1 The Tenant shall pay to the Landlord the Initial Rent of £42,500 per "
            "annum exclusive of VAT and any further rent ascertained pursuant to clause 5 "
            "(the &ldquo;Annual Rent&rdquo;).",
            s["body"],
        ),
        Paragraph(
            "4.2 The Annual Rent shall be paid by equal quarterly payments in advance on "
            "the usual quarter days, the first such payment (being a proportionate sum for "
            "the period from the date of this Lease to the next quarter day) to be paid on "
            "the date of this Lease.",
            s["body"],
        ),
        Paragraph(
            "4.3 All payments of Annual Rent shall be made by direct debit or standing "
            "order to such bank account as the Landlord shall from time to time direct.",
            s["body"],
        ),
        # ---- Rent review
        Paragraph("5. RENT REVIEW", s["h2"]),
        Paragraph(
            "5.1 The Annual Rent shall be reviewed on each Review Date to the higher of "
            "(a) the Annual Rent payable immediately before the Review Date and (b) the "
            "Open Market Rent of the Premises determined in accordance with this clause "
            "(the &ldquo;Reviewed Rent&rdquo;).",
            s["body"],
        ),
        Paragraph(
            "5.2 For the avoidance of doubt the rent review provided for in this clause "
            "is on an UPWARD ONLY basis and the Reviewed Rent shall in no circumstances "
            "be less than the Annual Rent payable immediately before the Review Date.",
            s["body"],
        ),
        Paragraph(
            "5.3 The Open Market Rent shall be the yearly rent at which the Premises "
            "might reasonably be expected to be let in the open market on the Review Date "
            "by a willing landlord to a willing tenant on the assumptions and disregards "
            "set out in Schedule 2.",
            s["body"],
        ),
        Paragraph(
            "5.4 If the parties have not agreed the Reviewed Rent by the Review Date the "
            "Landlord may at any time refer the determination of the Reviewed Rent to an "
            "independent surveyor appointed by the President of the Royal Institution of "
            "Chartered Surveyors acting as an expert.",
            s["body"],
        ),
        PageBreak(),
        # ---- Repair
        Paragraph("6. REPAIR AND DECORATION", s["h2"]),
        Paragraph(
            "6.1 The Tenant shall keep the Premises in good and substantial repair and "
            "condition (damage by Insured Risks excepted save where the policy of "
            "insurance is vitiated by any act or omission of the Tenant).",
            s["body"],
        ),
        Paragraph(
            "6.2 This Lease is a <b>full repairing and insuring (FRI) lease</b>. The Tenant "
            "shall be responsible for all repairs to the Premises whether internal or "
            "external, structural or non-structural.",
            s["body"],
        ),
        Paragraph(
            "6.3 The Tenant&rsquo;s repairing obligation shall be limited to keeping the "
            "Premises in no better state of repair than evidenced by the Schedule of "
            "Condition annexed to this Lease at Annexure 3 (the &ldquo;Schedule of "
            "Condition&rdquo;).",
            s["body"],
        ),
        Paragraph(
            "6.4 The Tenant shall in every fifth year of the Term and in the last six "
            "months of the Term decorate all internal parts of the Premises in a proper "
            "and workmanlike manner.",
            s["body"],
        ),
        # ---- Use
        Paragraph("7. PERMITTED USE", s["h2"]),
        Paragraph(
            "7.1 The Tenant shall use the Premises for the Permitted Use only and shall "
            "not use the Premises for any other purpose without the prior written consent "
            "of the Landlord (such consent not to be unreasonably withheld or delayed).",
            s["body"],
        ),
        Paragraph(
            "7.2 The Permitted Use is use as a restaurant and café falling within Use "
            "Class E(b) of the Town and Country Planning (Use Classes) Order 1987.",
            s["body"],
        ),
        # ---- Alienation
        Paragraph("8. ALIENATION", s["h2"]),
        Paragraph(
            "8.1 The Tenant shall not assign, underlet, charge or part with possession of "
            "the whole or any part of the Premises except as expressly permitted by this "
            "clause.",
            s["body"],
        ),
        Paragraph(
            "8.2 The Tenant may assign the whole (but not part) of the Premises with the "
            "prior written consent of the Landlord such consent not to be unreasonably "
            "withheld or delayed and subject to the Tenant entering into an Authorised "
            "Guarantee Agreement (AGA) in such form as the Landlord shall reasonably "
            "require.",
            s["body"],
        ),
        Paragraph(
            "8.3 The Tenant may underlet the whole of the Premises (but not part) with "
            "the prior written consent of the Landlord, such consent not to be "
            "unreasonably withheld or delayed.",
            s["body"],
        ),
        # ---- Break
        Paragraph("9. TENANT&rsquo;S BREAK OPTION", s["h2"]),
        Paragraph(
            "9.1 The Tenant may determine this Lease on 30 April 2027 (the &ldquo;Break "
            "Date&rdquo;) by giving to the Landlord not less than SIX (6) months&rsquo; "
            "prior written notice. Time shall be of the essence in respect of the service "
            "of such notice.",
            s["body"],
        ),
        Paragraph(
            "9.2 The Tenant&rsquo;s right to determine this Lease on the Break Date is "
            "conditional upon (a) the Tenant having paid all sums of Annual Rent then due, "
            "and (b) the Tenant giving vacant possession of the Premises on the Break Date.",
            s["body"],
        ),
        Paragraph(
            "9.3 For the avoidance of doubt the latest date on which the Tenant&rsquo;s "
            "break notice may validly be served upon the Landlord is 31 October 2026.",
            s["body"],
        ),
        PageBreak(),
        # ---- Insurance
        Paragraph("10. INSURANCE", s["h2"]),
        Paragraph(
            "10.1 The Landlord shall insure the Building against the Insured Risks and "
            "the Tenant shall pay to the Landlord on demand by way of further rent the "
            "fair and reasonable proportion of the premium attributable to the Premises.",
            s["body"],
        ),
        # ---- Service charge
        Paragraph("11. SERVICE CHARGE", s["h2"]),
        Paragraph(
            "11.1 The Tenant shall pay to the Landlord by way of further rent the Service "
            "Charge being the fair and reasonable proportion of the costs incurred by the "
            "Landlord in providing the Services in accordance with Schedule 4.",
            s["body"],
        ),
        Paragraph(
            "11.2 The Service Charge payable by the Tenant in any service charge year "
            "shall not exceed an amount equal to the Service Charge for the previous "
            "service charge year increased by the percentage increase (if any) in the "
            "Retail Prices Index (RPI) over the same period, subject to a CAP of 5% per "
            "annum and a COLLAR of 0% per annum.",
            s["body"],
        ),
        # ---- Rent deposit
        Paragraph("12. RENT DEPOSIT", s["h2"]),
        Paragraph(
            "12.1 The parties acknowledge that contemporaneously with the grant of this "
            "Lease the Tenant has paid to the Landlord the Rent Deposit of £10,625 (being "
            "three months of the Initial Rent) which shall be held in accordance with the "
            "terms of a separate Rent Deposit Deed of even date.",
            s["body"],
        ),
        # ---- Guarantee
        Paragraph("13. GUARANTEE", s["h2"]),
        Paragraph(
            "13.1 In consideration of the grant of this Lease the Guarantor hereby "
            "guarantees to the Landlord the due and punctual performance and observance "
            "by the Tenant of all the Tenant&rsquo;s covenants in this Lease.",
            s["body"],
        ),
        Paragraph(
            "13.2 The Guarantor&rsquo;s liability shall be a primary liability and shall "
            "not be released by any indulgence or time given by the Landlord to the "
            "Tenant.",
            s["body"],
        ),
        PageBreak(),
        # ---- Forfeiture & misc
        Paragraph("14. FORFEITURE", s["h2"]),
        Paragraph(
            "14.1 If at any time during the Term the Annual Rent or any other sums "
            "payable by the Tenant shall be in arrears for 21 days after becoming due "
            "(whether formally demanded or not) or the Tenant shall be in breach of any "
            "of the covenants on its part contained in this Lease the Landlord may "
            "re-enter the Premises and this Lease shall thereupon absolutely determine "
            "without prejudice to any rights or remedies of the Landlord against the "
            "Tenant.",
            s["body"],
        ),
        # ---- 1954 Act
        Paragraph("15. SECURITY OF TENURE", s["h2"]),
        Paragraph(
            "15.1 This Lease is granted with the protection of Part II of the Landlord "
            "and Tenant Act 1954.",
            s["body"],
        ),
        # ---- Notices
        Paragraph("16. NOTICES", s["h2"]),
        Paragraph(
            "16.1 Any notice required to be given under this Lease shall be in writing "
            "and shall be delivered by hand or sent by recorded delivery to the address "
            "of the recipient set out at the head of this Lease.",
            s["body"],
        ),
        # ---- Execution
        Spacer(1, 1.4 * cm),
        Paragraph("IN WITNESS whereof the parties have executed this Lease as a deed.", s["body"]),
        Spacer(1, 1 * cm),
        Paragraph("Signed by the Landlord: ............................................", s["small"]),
        Paragraph("Signed by the Tenant:    ............................................", s["small"]),
        Paragraph("Signed by the Guarantor: ............................................", s["small"]),
        PageBreak(),
        # ---- Schedules
        Paragraph("SCHEDULE 1 — THE PREMISES", s["h2"]),
        Paragraph(
            "ALL THAT property known as the ground floor and basement of 14 Crouch End "
            "Broadway, London N8 8DT, having a net internal area of approximately 1,250 "
            "square feet (116.1 sq m), with a Zone A frontage of 6.2 metres, shown edged "
            "red on the plan attached hereto.",
            s["body"],
        ),
        Paragraph("SCHEDULE 2 — RENT REVIEW ASSUMPTIONS AND DISREGARDS", s["h2"]),
        Paragraph(
            "1. The Open Market Rent shall be assessed on the assumption that: (a) the "
            "Premises are available to let by a willing landlord to a willing tenant by "
            "one lease, with vacant possession, without any premium being payable; (b) the "
            "Premises are in good repair and condition; (c) no work has been carried out "
            "to the Premises by the Tenant which would diminish the rental value.",
            s["body"],
        ),
        Paragraph(
            "2. There shall be disregarded: (a) any goodwill attaching to the Premises by "
            "reason of any business carried on there by the Tenant; (b) any improvements "
            "carried out by the Tenant.",
            s["body"],
        ),
        Paragraph("SCHEDULE 3 — SCHEDULE OF CONDITION", s["h2"]),
        Paragraph(
            "[Photographic Schedule of Condition annexed at Annexure 3, dated 28 April "
            "2022, prepared by Marshall Surveyors LLP. Schedule referenced but not "
            "reproduced in this demonstration document.]",
            s["body"],
        ),
        Paragraph("SCHEDULE 4 — THE SERVICES", s["h2"]),
        Paragraph(
            "The Landlord shall provide: (a) maintenance of the structure and exterior of "
            "the Building; (b) cleaning of common parts; (c) buildings insurance; "
            "(d) management of the Building; subject to the cap and collar set out in "
            "clause 11.2.",
            s["body"],
        ),
    ]

    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
