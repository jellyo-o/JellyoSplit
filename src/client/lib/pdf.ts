import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchApi } from './api';
import { computeCategoryShares } from './splits';

function getAssigned(category: any, allParticipants: any[]): any[] {
  return allParticipants.filter((p: any) =>
    p.categoryAssignments?.some((a: any) => a.categoryId === category.id) ||
    category.participants?.some((cp: any) => cp.participantId === p.id)
  );
}

export async function exportGatheringJson(gatheringId: string, gatheringName: string) {
  const data = await fetchApi(`/gatherings/${gatheringId}/export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${gatheringName.replace(/[^a-zA-Z0-9 ]/g, '_')}_export.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ExportSections {
  expenseSummary: boolean;
  categories: boolean;
  balanceSummary: boolean;
  settlement: boolean;
  categoryDetails: boolean;
  individualBreakdown: boolean;
  payments: boolean;
}

export const DEFAULT_SECTIONS: ExportSections = {
  expenseSummary: true,
  categories: true,
  balanceSummary: true,
  settlement: true,
  categoryDetails: true,
  individualBreakdown: true,
  payments: true,
};

export type SectionKey = keyof ExportSections;

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'expenseSummary',
  'categories',
  'balanceSummary',
  'settlement',
  'categoryDetails',
  'individualBreakdown',
  'payments',
];

export type OverallAdjStyle = 'per-category' | 'separate-line' | 'hidden';

export interface FooterOptions {
  appName: boolean;
  date: boolean;
  pageNumbers: boolean;
  gatheringName: boolean;
}

export const DEFAULT_FOOTER: FooterOptions = {
  appName: true,
  date: true,
  pageNumbers: true,
  gatheringName: false,
};

export interface PdfExportOptions {
  sections: ExportSections;
  overallAdjStyle: OverallAdjStyle;
  footer: FooterOptions;
  filterPeople: string[] | null;   // null = all people
  filterCategories: string[] | null; // null = all categories
}

export async function exportGatheringPdf(
  gatheringId: string,
  sections: ExportSections = DEFAULT_SECTIONS,
  overallAdjStyle: OverallAdjStyle = 'separate-line',
  footer: FooterOptions = DEFAULT_FOOTER,
  filterPeople: string[] | null = null,
  filterCategories: string[] | null = null,
  categoryMeta: { participantCount: boolean; basePerPerson: boolean; sourceBreakdown: boolean } = { participantCount: true, basePerPerson: true, sourceBreakdown: true },
  hideEmptyCategories: boolean = false,
  sectionOrder: SectionKey[] = DEFAULT_SECTION_ORDER,
) {
  const [gathering, settlement, publicSettings] = await Promise.all([
    fetchApi(`/gatherings/${gatheringId}`),
    fetchApi(`/gatherings/${gatheringId}/settlement/compute`).catch(() => ({ transactions: [] })),
    fetchApi('/settings/public').catch(() => ({ settings: { appName: 'GatherSplit' } })),
  ]);
  const appName = publicSettings.settings?.appName || 'GatherSplit';

  const currency = gathering.currency;
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  const getName = (id: string) => {
    const p = gathering.participants.find((pt: any) => pt.id === id);
    return p ? `${p.emoji || ''} ${p.name}`.trim() : 'Unknown';
  };

  // Pre-compute shares
  const allShares: Record<string, Record<string, { share: number; adjLabel: string | null }>> = {};
  for (const cat of gathering.categories) {
    const assigned = getAssigned(cat, gathering.participants);
    allShares[cat.id] = computeCategoryShares(cat.id, cat.totalAmount, assigned);
  }

  // Per-person breakdown — first pass: category shares only
  const peopleBase = gathering.participants.map((p: any) => {
    const cats: { name: string; share: number; adjLabel: string | null }[] = [];
    let totalOwed = 0;
    for (const cat of gathering.categories) {
      const si = allShares[cat.id]?.[p.id];
      if (!si) continue;
      cats.push({ name: cat.name, share: si.share, adjLabel: si.adjLabel });
      totalOwed += si.share;
    }
    const totalPaid = (gathering.payments ?? [])
      .filter((pay: any) => pay.participantId === p.id)
      .reduce((sum: number, pay: any) => sum + pay.amount, 0);
    return {
      participant: p,
      name: `${p.emoji || ''} ${p.name}`.trim(),
      categories: cats,
      totalOwed,
      totalPaid,
      balance: totalPaid - totalOwed,
    };
  });

  // Second pass: overall adjustments — each redistributes independently to all others
  const participantCount = peopleBase.length;
  if (participantCount > 1) {
    const baseOwed = peopleBase.map((p: any) => p.totalOwed);
    for (let i = 0; i < peopleBase.length; i++) {
      const p = peopleBase[i].participant;
      for (const adj of p.adjustments?.filter((a: any) => !a.categoryId) ?? []) {
        let diff = 0;
        if (adj.type === 'redistribute_less' || adj.type === 'percentage') diff = -(baseOwed[i] * adj.value / 100);
        else if (adj.type === 'redistribute_more') diff = baseOwed[i] * adj.value / 100;
        else if (adj.type === 'fixed_less' || adj.type === 'fixed') diff = -adj.value;
        else if (adj.type === 'fixed_more') diff = adj.value;
        if (Math.abs(diff) < 0.001) continue;

        peopleBase[i].totalOwed += diff;
        const redistEach = -diff / (participantCount - 1);
        for (let j = 0; j < peopleBase.length; j++) {
          if (j !== i) peopleBase[j].totalOwed += redistEach;
        }
      }
    }
    for (const p of peopleBase) p.balance = p.totalPaid - p.totalOwed;
  }

  // Third pass: if 'per-category' or 'hidden' style, distribute overall adjustment proportionally
  // into per-category shares so category detail pages show final amounts.
  // If 'separate-line', keep raw category shares and show overall adj as a separate line.
  const adjustedSharesByParticipant: Record<string, Record<string, number>> = {};
  const hideAdj = overallAdjStyle === 'hidden';

  if (overallAdjStyle === 'per-category' || hideAdj) {
    for (const p of peopleBase) {
      const catTotal = p.categories.reduce((s: number, c: any) => s + c.share, 0);
      if (catTotal > 0.01 && Math.abs(p.totalOwed - catTotal) > 0.01) {
        const ratio = p.totalOwed / catTotal;
        for (const c of p.categories) {
          c.share = c.share * ratio;
        }
      }
    }
    for (const pb of peopleBase) {
      const pid = pb.participant.id;
      adjustedSharesByParticipant[pid] = {};
      for (const c of pb.categories) {
        const cat = gathering.categories.find((gc: any) => gc.name === c.name);
        if (cat) adjustedSharesByParticipant[pid][cat.id] = c.share;
      }
    }
  }

  const filteredPeopleBase = filterPeople && filterPeople.length > 0
    ? peopleBase.filter((p: any) => filterPeople.includes(p.participant.id))
    : peopleBase;
  const people = filteredPeopleBase.map(({ participant: _p, ...rest }: any) => rest);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  const headStyle = { fillColor: [245, 245, 245] as [number, number, number], textColor: [55, 65, 81] as [number, number, number], fontStyle: 'bold' as const, fontSize: 9 };
  const bodyStyle = { fontSize: 9, textColor: [31, 41, 55] as [number, number, number] };
  const footStyle = { fillColor: [249, 250, 251] as [number, number, number], textColor: [31, 41, 55] as [number, number, number], fontStyle: 'bold' as const, fontSize: 9 };

  // Helper: ensures headers are right-aligned for columns that have right-aligned data
  function rightAlignCols(...cols: number[]) {
    const colSet = new Set(cols);
    return (data: any) => {
      if (colSet.has(data.column.index)) {
        data.cell.styles.halign = 'right';
      }
    };
  }

  function sectionTitle(title: string) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  }

  // ─── PAGE 1: HEADER ───
  doc.setFontSize(22);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text(gathering.name, margin, y + 7);
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');
  const metaParts: string[] = [];
  if (gathering.date) metaParts.push(`Date: ${new Date(gathering.date).toLocaleDateString()}`);
  metaParts.push(`Currency: ${currency}`);
  metaParts.push(`Generated: ${new Date().toLocaleDateString()}`);
  doc.text(metaParts.join('  |  '), margin, y);
  y += 3;

  // Purple accent line
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  let filteredCategories = filterCategories && filterCategories.length > 0
    ? gathering.categories.filter((c: any) => filterCategories.includes(c.id))
    : gathering.categories;
  if (hideEmptyCategories) {
    filteredCategories = filteredCategories.filter((c: any) => getAssigned(c, gathering.participants).length > 0);
  }
  const grandTotal = filteredCategories.reduce((s: number, c: any) => s + c.totalAmount, 0);

  // ─── SECTION RENDERERS ───
  const filteredPayments = (gathering.payments ?? []).filter((pay: any) =>
    !filterPeople || filterPeople.length === 0 || filterPeople.includes(pay.participantId)
  );

  // Track whether any content has been rendered on the header page.
  // Sections that normally start a new page should skip the addPage()
  // if they're the first section, so the header page isn't left blank.
  let headerPageUsed = false;

  function newPageUnlessFirst() {
    if (headerPageUsed) {
      doc.addPage();
      y = margin;
    }
    headerPageUsed = true;
  }

  const sectionRenderers: Record<SectionKey, () => void> = {
    expenseSummary: () => {
      sectionTitle('Expense Summary');

      const activePeople = filteredPeopleBase.filter((p: any) => p.categories.length > 0 || p.totalPaid > 0);
      if (activePeople.length === 0) return;

      // Build assignment lookup: participantId -> Set of categoryIds
      const assignmentMap: Record<string, Set<string>> = {};
      for (const p of activePeople) {
        assignmentMap[p.participant.id] = new Set(p.categories.map((c: any) => {
          const cat = filteredCategories.find((fc: any) => fc.name === c.name);
          return cat?.id;
        }).filter(Boolean));
      }

      const catTotals = filteredCategories.map((c: any) => c.totalAmount);
      const pCount = activePeople.length;
      const cCount = filteredCategories.length;

      // Orient: put the larger dimension on rows (vertical)
      const peopleOnRows = pCount >= cCount;
      const matrixFontSize = 7;
      const matrixHeadStyle = { ...headStyle, fontSize: matrixFontSize };
      const matrixBodyStyle = { ...bodyStyle, fontSize: matrixFontSize };
      const matrixFootStyle = { ...footStyle, fontSize: matrixFontSize };

      if (peopleOnRows) {
        // Columns: [Name, cat1, cat2, ..., Owes, Paid, Balance]
        const head = ['', ...filteredCategories.map((c: any) => c.name), 'Owes', 'Paid', 'Balance'];
        const body = activePeople.map((p: any) => {
          const name = `${p.participant.emoji || ''} ${p.participant.name}`.trim();
          const marks = filteredCategories.map((c: any) => assignmentMap[p.participant.id]?.has(c.id) ? '\u2713' : '');
          return [
            name,
            ...marks,
            fmt(p.totalOwed),
            p.totalPaid > 0 ? fmt(p.totalPaid) : '-',
            `${p.balance > 0.01 ? '+' : ''}${fmt(p.balance)}`,
          ];
        });
        const foot = ['Total', ...catTotals.map((t: number) => fmt(t)), fmt(grandTotal), '', ''];

        const amountColStart = 1 + cCount; // index of Owes column
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [head],
          body,
          foot: [foot],
          headStyles: matrixHeadStyle,
          bodyStyles: matrixBodyStyle,
          footStyles: matrixFootStyle,
          didParseCell: (data: any) => {
            const ci = data.column.index;
            // Center the checkmark columns
            if (ci >= 1 && ci < amountColStart) {
              data.cell.styles.halign = 'center';
              if (data.section === 'body' && data.cell.raw === '\u2713') {
                data.cell.styles.textColor = [79, 70, 229];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            // Right-align amount columns
            if (ci >= amountColStart) data.cell.styles.halign = 'right';
            // Color balance column
            if (data.section === 'body' && ci === amountColStart + 2) {
              const val = data.cell.raw as string;
              if (val.startsWith('+')) data.cell.styles.textColor = [22, 163, 74];
              else if (parseFloat(val.replace(/[^0-9.-]/g, '')) < -0.01) data.cell.styles.textColor = [220, 38, 38];
            }
          },
        });
      } else {
        // Categories on rows, participants on columns
        // Columns: [Category, person1, person2, ..., Total]
        const head = ['', ...activePeople.map((p: any) => `${p.participant.emoji || ''} ${p.participant.name}`.trim()), 'Total'];
        const body = filteredCategories.map((c: any, ci: number) => {
          const marks = activePeople.map((p: any) => assignmentMap[p.participant.id]?.has(c.id) ? '\u2713' : '');
          return [c.name, ...marks, fmt(catTotals[ci])];
        });

        // Footer rows: Owes, Paid, Balance
        const owesRow = ['Owes', ...activePeople.map((p: any) => fmt(p.totalOwed)), fmt(grandTotal)];
        const paidRow = ['Paid', ...activePeople.map((p: any) => p.totalPaid > 0 ? fmt(p.totalPaid) : '-'), ''];
        const balRow = ['Balance', ...activePeople.map((p: any) => `${p.balance > 0.01 ? '+' : ''}${fmt(p.balance)}`), ''];

        const personColStart = 1;
        const totalCol = 1 + pCount;
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [head],
          body,
          foot: [owesRow, paidRow, balRow],
          headStyles: matrixHeadStyle,
          bodyStyles: matrixBodyStyle,
          footStyles: matrixFootStyle,
          didParseCell: (data: any) => {
            const ci = data.column.index;
            // Center the checkmark columns
            if (ci >= personColStart && ci < totalCol) {
              if (data.section === 'body') {
                data.cell.styles.halign = 'center';
                if (data.cell.raw === '\u2713') {
                  data.cell.styles.textColor = [79, 70, 229];
                  data.cell.styles.fontStyle = 'bold';
                }
              }
              // Right-align footer amounts
              if (data.section === 'foot') data.cell.styles.halign = 'right';
            }
            // Right-align total column
            if (ci === totalCol) data.cell.styles.halign = 'right';
            // Color balance row in footer
            if (data.section === 'foot' && data.row.index === 2 && ci >= personColStart && ci < totalCol) {
              const val = data.cell.raw as string;
              if (val.startsWith('+')) data.cell.styles.textColor = [22, 163, 74];
              else if (parseFloat(val.replace(/[^0-9.-]/g, '')) < -0.01) data.cell.styles.textColor = [220, 38, 38];
            }
          },
        });
      }
      y = (doc as any).lastAutoTable.finalY + 10;
      headerPageUsed = true;
    },

    categories: () => {
      sectionTitle('Expense Categories');
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Category', 'Total', 'Items', 'People', 'Per Person']],
        body: filteredCategories.map((cat: any) => {
          const assigned = getAssigned(cat, gathering.participants);
          const pp = assigned.length > 0 ? cat.totalAmount / assigned.length : 0;
          return [cat.name, fmt(cat.totalAmount), cat.sources?.length || '-', assigned.length, assigned.length > 0 ? fmt(pp) : '-'];
        }),
        foot: [['Total', fmt(grandTotal), '', '', '']],
        headStyles: headStyle,
        bodyStyles: bodyStyle,
        footStyles: footStyle,
        didParseCell: rightAlignCols(1, 2, 3, 4),
      });
      y = (doc as any).lastAutoTable.finalY + 10;
      headerPageUsed = true;
    },

    balanceSummary: () => {
      sectionTitle('Balance Summary');
      const balanceBody = people
        .filter((p: any) => p.categories.length > 0 || p.totalPaid > 0)
        .map((p: any) => [
          p.name,
          fmt(p.totalOwed),
          p.totalPaid > 0 ? fmt(p.totalPaid) : '-',
          `${p.balance > 0.01 ? '+' : ''}${fmt(p.balance)}`,
        ]);
      if (balanceBody.length > 0) {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Participant', 'Owes', 'Paid', 'Balance']],
          body: balanceBody,
          headStyles: headStyle,
          bodyStyles: bodyStyle,
          didParseCell: (data: any) => {
            if ([1, 2, 3].includes(data.column.index)) data.cell.styles.halign = 'right';
            if (data.section === 'body' && data.column.index === 3) {
              const val = data.cell.raw as string;
              if (val.startsWith('+')) data.cell.styles.textColor = [22, 163, 74];
              else if (parseFloat(val.replace(/[^0-9.-]/g, '')) < -0.01) data.cell.styles.textColor = [220, 38, 38];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }
      headerPageUsed = true;
    },

    settlement: () => {
      const filteredTxs = filterPeople && filterPeople.length > 0
        ? settlement.transactions.filter((tx: any) => filterPeople.includes(tx.fromParticipantId) && filterPeople.includes(tx.toParticipantId))
        : settlement.transactions;
      sectionTitle('Settlement Plan');
      if (filteredTxs.length > 0) {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['From', 'To', 'Amount']],
          body: filteredTxs.map((tx: any) => [
            getName(tx.fromParticipantId), getName(tx.toParticipantId), fmt(tx.amount),
          ]),
          headStyles: headStyle,
          bodyStyles: bodyStyle,
          didParseCell: rightAlignCols(2),
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        doc.text('Everyone is settled up!', margin, y);
        y += 8;
      }
      headerPageUsed = true;
    },

    categoryDetails: () => {
      for (const cat of filteredCategories) {
        const allAssigned = getAssigned(cat, gathering.participants);
        const assigned = filterPeople && filterPeople.length > 0
          ? allAssigned.filter((p: any) => filterPeople.includes(p.id))
          : allAssigned;
        if (assigned.length === 0 && hideEmptyCategories) continue;

        doc.addPage();
        y = margin;
        headerPageUsed = true;

        const perPerson = allAssigned.length > 0 ? cat.totalAmount / allAssigned.length : 0;
        const shares = allShares[cat.id] ?? {};
        const sources: any[] = cat.sources ?? [];

        doc.setFillColor(79, 70, 229);
        const showCount = categoryMeta.participantCount;
        const showBase = categoryMeta.basePerPerson;
        const showSources = categoryMeta.sourceBreakdown;
        const hasBannerSub = showCount || showBase;
        const bannerH = hasBannerSub ? 28 : 22;
        doc.rect(0, 0, pageW, bannerH, 'F');
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(cat.name, margin, 14);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(fmt(cat.totalAmount), pageW - margin, 14, { align: 'right' });
        if (hasBannerSub) {
          doc.setFontSize(9);
          const parts: string[] = [];
          if (showCount) parts.push(`${assigned.length} participant${assigned.length !== 1 ? 's' : ''}`);
          if (showBase && assigned.length > 0) parts.push(`${fmt(perPerson)} base per person`);
          if (parts.length > 0) doc.text(parts.join('  |  '), margin, 22);
        }
        y = bannerH + 8;

        if (sources.length > 0 && showSources) {
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.setFont('helvetica', 'bold');
          doc.text('BREAKDOWN', margin, y);
          y += 4;
          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['Item', 'Amount', 'Note']],
            body: sources.map((s: any) => [s.name, fmt(s.amount), s.note || '']),
            headStyles: { ...headStyle, fontSize: 8 },
            bodyStyles: { ...bodyStyle, fontSize: 8 },
            didParseCell: rightAlignCols(1),
          });
          y = (doc as any).lastAutoTable.finalY + 5;
        }

        if (assigned.length > 0) {
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.setFont('helvetica', 'bold');
          const partHeaderParts: string[] = [];
          if (showCount) partHeaderParts.push(String(assigned.length));
          if (showBase && !hideAdj) partHeaderParts.push(`${fmt(perPerson)} base`);
          doc.text(partHeaderParts.length > 0 ? `PARTICIPANTS (${partHeaderParts.join(', ')})` : 'PARTICIPANTS', margin, y);
          y += 4;

          const partBody = assigned.map((ap: any) => {
            const catOnlyShare = shares[ap.id]?.share ?? perPerson;
            const si = shares[ap.id];
            if (hideAdj) {
              const adjustedShare = adjustedSharesByParticipant[ap.id]?.[cat.id] ?? catOnlyShare;
              return [`${ap.emoji || ''} ${ap.name}`.trim(), fmt(adjustedShare)];
            }
            let adjCol = '';
            if (overallAdjStyle === 'per-category') {
              const adjustedShare = adjustedSharesByParticipant[ap.id]?.[cat.id] ?? catOnlyShare;
              if (si?.adjLabel) adjCol = si.adjLabel;
              if (Math.abs(adjustedShare - catOnlyShare) > 0.005) {
                const overallDiff = adjustedShare - catOnlyShare;
                adjCol += (adjCol ? ', ' : '') + `${overallDiff > 0 ? '+' : ''}${fmt(overallDiff)} overall`;
              } else if (!si?.adjLabel && Math.abs(adjustedShare - perPerson) > 0.005) {
                adjCol = `${adjustedShare - perPerson > 0 ? '+' : ''}${fmt(adjustedShare - perPerson)} redist`;
              }
              return [`${ap.emoji || ''} ${ap.name}`.trim(), fmt(adjustedShare), adjCol];
            } else {
              if (si?.adjLabel) adjCol = si.adjLabel;
              else if (Math.abs(catOnlyShare - perPerson) > 0.005) {
                adjCol = `${catOnlyShare - perPerson > 0 ? '+' : ''}${fmt(catOnlyShare - perPerson)} redist`;
              }
              return [`${ap.emoji || ''} ${ap.name}`.trim(), fmt(catOnlyShare), adjCol];
            }
          });
          const catShareTotal = assigned.reduce((s: number, ap: any) => {
            if (overallAdjStyle === 'per-category' || hideAdj) {
              return s + (adjustedSharesByParticipant[ap.id]?.[cat.id] ?? shares[ap.id]?.share ?? perPerson);
            }
            return s + (shares[ap.id]?.share ?? perPerson);
          }, 0);
          partBody.push(hideAdj ? ['Total', fmt(catShareTotal)] : ['Total', fmt(catShareTotal), '']);

          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [hideAdj ? ['Name', 'Share'] : ['Name', 'Share', 'Adjustment']],
            body: partBody,
            headStyles: { ...headStyle, fontSize: 8 },
            bodyStyles: { ...bodyStyle, fontSize: 8 },
            didParseCell: (data: any) => {
              if (data.column.index >= 1) data.cell.styles.halign = 'right';
              if (data.section === 'body' && data.row.index === partBody.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [249, 250, 251];
              }
            },
          });
          y = (doc as any).lastAutoTable.finalY + 10;
        } else {
          doc.setFontSize(9);
          doc.setTextColor(156, 163, 175);
          doc.text('No participants assigned.', margin, y);
          y += 8;
        }
      }
    },

    individualBreakdown: () => {
      newPageUnlessFirst();
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);
      doc.text(`Individual Breakdown - ${gathering.name}`, margin, y);
      y += 8;
      sectionTitle('Individual Breakdown');

      for (const person of people) {
        if (person.categories.length === 0 && person.totalPaid === 0) continue;
        if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = margin; }

        doc.setFillColor(55, 65, 81);
        doc.roundedRect(margin, y - 5, pageW - 2 * margin, 18, 3, 3, 'F');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(person.name, margin + 5, y + 4);
        const balText = `${person.balance > 0.01 ? '+' : ''}${fmt(person.balance)}`;
        if (person.balance > 0.01) doc.setTextColor(134, 239, 172);
        else if (person.balance < -0.01) doc.setTextColor(252, 165, 165);
        else doc.setTextColor(200, 200, 200);
        doc.setFontSize(11);
        doc.text(balText, pageW - margin - 5, y + 4, { align: 'right' });
        doc.setTextColor(31, 41, 55);
        y += 18;

        const catBody: any[][] = hideAdj
          ? person.categories.map((c: any) => [c.name, fmt(c.share)])
          : person.categories.map((c: any) => [c.name, fmt(c.share), c.adjLabel || '']);
        const catSubtotal = person.categories.reduce((s: number, c: any) => s + c.share, 0);
        const overallAdjDiff = person.totalOwed - catSubtotal;

        if (!hideAdj) {
          catBody.push(['Subtotal (categories)', fmt(catSubtotal), '']);
          if (Math.abs(overallAdjDiff) > 0.005) {
            catBody.push(['Overall adjustment', `${overallAdjDiff > 0 ? '+' : ''}${fmt(overallAdjDiff)}`, '']);
          }
        }
        catBody.push(hideAdj ? ['Total Owed', fmt(person.totalOwed)] : ['Total Owed', fmt(person.totalOwed), '']);
        catBody.push(hideAdj ? ['Total Paid', person.totalPaid > 0 ? fmt(person.totalPaid) : '-'] : ['Total Paid', person.totalPaid > 0 ? fmt(person.totalPaid) : '-', '']);
        const balLabel = `${person.balance > 0.01 ? '+' : ''}${fmt(person.balance)}`;
        catBody.push(hideAdj ? ['Balance', balLabel] : ['Balance', balLabel, '']);

        const summaryRowCount = hideAdj ? 3 : (Math.abs(overallAdjDiff) > 0.005 ? 5 : 4);
        const summaryStartIdx = catBody.length - summaryRowCount;

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [hideAdj ? ['Category', 'Share'] : ['Category', 'Share', 'Adjustment']],
          body: catBody,
          headStyles: { ...headStyle, fontSize: 8 },
          bodyStyles: { ...bodyStyle, fontSize: 8 },
          didParseCell: (data: any) => {
            if (data.column.index >= 1) data.cell.styles.halign = 'right';
            if (data.section === 'body' && data.row.index >= summaryStartIdx) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [249, 250, 251];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        const personPayments = (gathering.payments ?? []).filter((pay: any) => pay.participantId === gathering.participants.find((pt: any) => `${pt.emoji || ''} ${pt.name}`.trim() === person.name)?.id);
        if (sections.payments && personPayments.length > 0) {
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.setFont('helvetica', 'bold');
          doc.text('PAYMENTS', margin, y);
          y += 4;
          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['For', 'Amount', 'Note']],
            body: personPayments.map((pay: any) => {
              const catName = pay.categoryId ? gathering.categories.find((c: any) => c.id === pay.categoryId)?.name || '' : 'Overall';
              return [catName, fmt(pay.amount), pay.note || ''];
            }),
            headStyles: { ...headStyle, fontSize: 8 },
            bodyStyles: { ...bodyStyle, fontSize: 8 },
            didParseCell: rightAlignCols(1),
          });
          y = (doc as any).lastAutoTable.finalY + 10;
        }
      }
    },

    payments: () => {
      if (filteredPayments.length === 0) return;
      newPageUnlessFirst();
      sectionTitle('Payments');
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Participant', 'Category', 'Amount', 'Note', 'Date']],
        body: filteredPayments.map((pay: any) => {
          const pName = getName(pay.participantId);
          const catName = pay.categoryId
            ? gathering.categories.find((c: any) => c.id === pay.categoryId)?.name || ''
            : 'Overall';
          return [pName, catName, fmt(pay.amount), pay.note || '', new Date(pay.createdAt).toLocaleDateString()];
        }),
        headStyles: headStyle,
        bodyStyles: bodyStyle,
        didParseCell: rightAlignCols(2),
      });
    },
  };

  // Render sections in user-specified order
  for (const key of sectionOrder) {
    if (sections[key]) sectionRenderers[key]();
  }

  // ─── FOOTER ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    const footerParts: string[] = [];
    if (footer.appName) footerParts.push(`Generated by ${appName}`);
    if (footer.gatheringName) footerParts.push(gathering.name);
    if (footer.date) footerParts.push(new Date().toLocaleString());
    if (footer.pageNumbers) footerParts.push(`Page ${i} of ${totalPages}`);
    if (footerParts.length > 0) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        footerParts.join('  |  '),
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
    }
  }

  doc.save(`${gathering.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_invoice.pdf`);
}
