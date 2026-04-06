import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FileSpreadsheet, FileJson, Upload, FileDown, GripVertical, ChevronDown } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../components/ui/Toast';
import { useGatheringContext } from '../context/GatheringContext';
import { useSettings } from '../context/SettingsContext';
import { fetchApi } from '../lib/api';
import { cn } from '../lib/utils';
import { exportGatheringPdf, exportGatheringJson, DEFAULT_SECTIONS, DEFAULT_SECTION_ORDER, DEFAULT_FOOTER, type ExportSections, type SectionKey, type OverallAdjStyle, type FooterOptions } from '../lib/pdf';
import { computeCategoryShares } from '../lib/splits';
import { Button } from '../components/ui/Button';
import { Participant, Category } from '../hooks/useGathering';
import { useSessionState } from '../hooks/useSessionState';
import * as XLSX from 'xlsx';

function getAssigned(category: Category, allParticipants: Participant[]): Participant[] {
  return allParticipants.filter((p) =>
    p.categoryAssignments?.some((a: any) => a.categoryId === category.id) ||
    category.participants?.some((cp: any) => cp.participantId === p.id)
  );
}

function buildExportData(gathering: any) {
  const currency = gathering.currency;

  // Pre-compute shares
  const allShares: Record<string, Record<string, { share: number; adjLabel: string | null }>> = {};
  for (const cat of gathering.categories) {
    const assigned = getAssigned(cat, gathering.participants);
    allShares[cat.id] = computeCategoryShares(cat.id, cat.totalAmount, assigned);
  }

  // Per-person breakdown — first pass: category shares only
  const peopleBase = gathering.participants.map((p: any) => {
    const cats: { name: string; share: number }[] = [];
    let totalOwed = 0;
    for (const cat of gathering.categories) {
      const si = allShares[cat.id]?.[p.id];
      if (si) {
        cats.push({ name: cat.name, share: si.share });
        totalOwed += si.share;
      }
    }
    const totalPaid = (gathering.payments ?? [])
      .filter((pay: any) => pay.participantId === p.id)
      .reduce((sum: number, pay: any) => sum + pay.amount, 0);
    return { participant: p, name: p.name as string, emoji: (p.emoji || '') as string, categories: cats, totalOwed, totalPaid, balance: totalPaid - totalOwed };
  });

  // Second pass: overall adjustments — each redistributes independently
  const owedCount = peopleBase.filter((p: any) => p.totalOwed > 0.01).length;
  if (owedCount > 1) {
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
        const redistEach = -diff / (owedCount - 1);
        for (let j = 0; j < peopleBase.length; j++) {
          if (j !== i && baseOwed[j] > 0.01) peopleBase[j].totalOwed += redistEach;
        }
      }
    }
    for (const p of peopleBase) p.balance = p.totalPaid - p.totalOwed;
  }

  const people = peopleBase.map(({ participant: _p, ...rest }: any) => rest);
  return { currency, allShares, people };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9 ]/g, '_');
}

const SECTION_LABELS: Record<SectionKey, string> = {
  expenseSummary: 'Expense Summary',
  categories: 'Expense Categories',
  balanceSummary: 'Balance Summary',
  settlement: 'Settlement Plan',
  categoryDetails: 'Category Details',
  individualBreakdown: 'Individual Breakdown',
  payments: 'Payments',
};

function SortableSectionItem({ id, label, checked, onToggle }: { id: string; label: string; checked: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-white dark:bg-gray-800"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <label className="flex items-center gap-2 flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </label>
    </div>
  );
}

export default function ExportTab() {
  const { gathering } = useGatheringContext();
  const { appName } = useSettings();
  const navigate = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const sk = `export:${gathering.id}`;
  const [sections, setSections] = useSessionState<ExportSections>(`${sk}:sections`, { ...DEFAULT_SECTIONS });
  const [sectionOrder, setSectionOrder] = useSessionState<SectionKey[]>(`${sk}:sectionOrder`, [...DEFAULT_SECTION_ORDER]);
  const [overallAdjStyle, setOverallAdjStyle] = useSessionState<OverallAdjStyle>(`${sk}:adjStyle`, 'separate-line');
  const [footerOpts, setFooterOpts] = useSessionState<FooterOptions>(`${sk}:footer`, { ...DEFAULT_FOOTER });
  const [filterPeople, setFilterPeople] = useSessionState<string[] | null>(`${sk}:filterPeople`, null);
  const [filterCategories, setFilterCategories] = useSessionState<string[] | null>(`${sk}:filterCategories`, null);
  const [categoryMeta, setCategoryMeta] = useSessionState(`${sk}:catMeta`, { participantCount: true, basePerPerson: true, sourceBreakdown: true });
  const [hideEmptyCategories, setHideEmptyCategories] = useSessionState(`${sk}:hideEmptyCats`, false);
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as SectionKey);
        const newIndex = prev.indexOf(over.id as SectionKey);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const toggleSection = (key: keyof ExportSections) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const anySelected = Object.values(sections).some(Boolean);

  const selectAll = () => setSections({ ...DEFAULT_SECTIONS });
  const deselectAll = () => setSections({ expenseSummary: false, categories: false, balanceSummary: false, settlement: false, categoryDetails: false, individualBreakdown: false, payments: false });
  const resetOrder = () => setSectionOrder([...DEFAULT_SECTION_ORDER]);

  const guardExport = (fn: () => void) => () => {
    if (!anySelected) { toast.warning('Please select at least one section to include.'); return; }
    fn();
  };

  const effectiveAdjStyle = overallAdjStyle;

  const handleExportPdf = guardExport(() => exportGatheringPdf(gathering.id, sections, effectiveAdjStyle, footerOpts, filterPeople, filterCategories, categoryMeta, hideEmptyCategories, sectionOrder));

  const handleExportJson = () => exportGatheringJson(gathering.id, gathering.name);

  const handleExportCsv = guardExport(() => {
    const { currency, people } = buildExportData(gathering);
    const lines: string[] = [];

    let filteredCats = filterCategories && filterCategories.length > 0
      ? gathering.categories.filter((c: any) => filterCategories.includes(c.id))
      : gathering.categories;
    if (hideEmptyCategories) filteredCats = filteredCats.filter((c: any) => getAssigned(c, gathering.participants).length > 0);
    const filteredPeople = filterPeople && filterPeople.length > 0
      ? people.filter((p: any) => {
          const participant = gathering.participants.find((pt: any) => pt.name === p.name || `${pt.emoji || ''} ${pt.name}`.trim() === `${p.emoji} ${p.name}`.trim());
          return participant && filterPeople.includes(participant.id);
        })
      : people;

    const csvSections: Record<SectionKey, () => void> = {
      expenseSummary: () => {
        lines.push('--- Expense Summary ---');
        const activePeople = filteredPeople.filter((p: any) => p.categories.length > 0 || p.totalPaid > 0);
        const pCount = activePeople.length;
        const cCount = filteredCats.length;
        const gt = filteredCats.reduce((s: number, c: any) => s + c.totalAmount, 0);
        const isAssigned = (person: any, cat: any) =>
          person.categories.some((pc: any) => pc.name === cat.name);

        if (pCount >= cCount) {
          // Participants as rows
          lines.push(['', ...filteredCats.map((c: any) => `"${c.name}"`), 'Owes', 'Paid', 'Balance'].join(','));
          for (const p of activePeople) {
            const marks = filteredCats.map((c: any) => isAssigned(p, c) ? 'X' : '');
            lines.push([`"${p.emoji} ${p.name}"`, ...marks, p.totalOwed.toFixed(2), p.totalPaid.toFixed(2), p.balance.toFixed(2)].join(','));
          }
          lines.push(['Total', ...filteredCats.map((c: any) => c.totalAmount.toFixed(2)), gt.toFixed(2), '', ''].join(','));
        } else {
          // Categories as rows
          lines.push(['', ...activePeople.map((p: any) => `"${p.emoji} ${p.name}"`), 'Total'].join(','));
          for (const c of filteredCats) {
            const marks = activePeople.map((p: any) => isAssigned(p, c) ? 'X' : '');
            lines.push([`"${c.name}"`, ...marks, c.totalAmount.toFixed(2)].join(','));
          }
          lines.push(['Owes', ...activePeople.map((p: any) => p.totalOwed.toFixed(2)), gt.toFixed(2)].join(','));
          lines.push(['Paid', ...activePeople.map((p: any) => p.totalPaid.toFixed(2)), ''].join(','));
          lines.push(['Balance', ...activePeople.map((p: any) => p.balance.toFixed(2)), ''].join(','));
        }
        lines.push('');
      },
      categories: () => {
        lines.push('--- Categories ---');
        lines.push('Category,Total,People,Per Person');
        for (const cat of filteredCats) {
          const assigned = getAssigned(cat, gathering.participants);
          const pp = assigned.length > 0 ? cat.totalAmount / assigned.length : 0;
          lines.push(`"${cat.name}",${cat.totalAmount},${assigned.length},${pp.toFixed(2)}`);
        }
        lines.push('');
      },
      balanceSummary: () => {
        lines.push('--- Balance Summary ---');
        lines.push('Participant,Total Owed,Total Paid,Balance');
        for (const p of filteredPeople) {
          lines.push(`"${p.emoji} ${p.name}",${p.totalOwed.toFixed(2)},${p.totalPaid.toFixed(2)},${p.balance.toFixed(2)}`);
        }
        lines.push('');
      },
      settlement: () => {},
      categoryDetails: () => {},
      individualBreakdown: () => {
        lines.push('--- Individual Breakdown ---');
        lines.push('Participant,Total Owed,Total Paid,Balance');
        for (const p of filteredPeople) {
          lines.push(`"${p.emoji} ${p.name}",${p.totalOwed.toFixed(2)},${p.totalPaid.toFixed(2)},${p.balance.toFixed(2)}`);
        }
        lines.push('');
      },
      payments: () => {
        lines.push('--- Payments ---');
        lines.push('Participant,Category,Amount,Note');
        for (const pay of gathering.payments ?? []) {
          if (filterPeople && filterPeople.length > 0 && !filterPeople.includes(pay.participantId)) continue;
          if (filterCategories && filterCategories.length > 0 && pay.categoryId && !filterCategories.includes(pay.categoryId)) continue;
          const pName = gathering.participants.find((p: any) => p.id === pay.participantId)?.name || 'Unknown';
          const catName = pay.categoryId ? gathering.categories.find((c: any) => c.id === pay.categoryId)?.name || '' : 'Overall';
          lines.push(`"${pName}","${catName}",${pay.amount.toFixed(2)},"${(pay.note || '').replace(/"/g, '""')}"`);
        }
        lines.push('');
      },
    };

    for (const key of sectionOrder) {
      if (sections[key]) csvSections[key]();
    }

    lines.push(`Generated by ${appName},${new Date().toLocaleString()}`);
    lines.push(`Currency: ${currency}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${safeName(gathering.name)}_export.csv`);
  });

  const handleExportExcel = guardExport(async () => {
    const { allShares, people } = buildExportData(gathering);
    const wb = XLSX.utils.book_new();
    const hideAdj = effectiveAdjStyle === 'hidden';

    let filteredCats = filterCategories && filterCategories.length > 0
      ? gathering.categories.filter((c: any) => filterCategories.includes(c.id))
      : gathering.categories;
    if (hideEmptyCategories) filteredCats = filteredCats.filter((c: any) => getAssigned(c, gathering.participants).length > 0);
    const filteredPeople = filterPeople && filterPeople.length > 0
      ? people.filter((p: any) => {
          const participant = gathering.participants.find((pt: any) => pt.name === p.name || `${pt.emoji || ''} ${pt.name}`.trim() === `${p.emoji} ${p.name}`.trim());
          return participant && filterPeople.includes(participant.id);
        })
      : people;

    // Settlement needs async fetch — pre-fetch if needed
    let settlement: any = null;
    if (sections.settlement) {
      try {
        settlement = await fetchApi(`/gatherings/${gathering.id}/settlement/compute`);
      } catch {}
    }

    const excelSections: Record<SectionKey, () => void> = {
      expenseSummary: () => {
        const activePeople = filteredPeople.filter((p: any) => p.categories.length > 0 || p.totalPaid > 0);
        const pCount = activePeople.length;
        const cCount = filteredCats.length;
        const gt = filteredCats.reduce((s: number, c: any) => s + c.totalAmount, 0);
        const isAssigned = (person: any, cat: any) =>
          person.categories.some((pc: any) => pc.name === cat.name);
        const data: any[][] = [];

        if (pCount >= cCount) {
          data.push(['', ...filteredCats.map((c: any) => c.name), 'Owes', 'Paid', 'Balance']);
          for (const p of activePeople) {
            const marks = filteredCats.map((c: any) => isAssigned(p, c) ? '\u2713' : '');
            data.push([`${p.emoji} ${p.name}`, ...marks, parseFloat(p.totalOwed.toFixed(2)), parseFloat(p.totalPaid.toFixed(2)), parseFloat(p.balance.toFixed(2))]);
          }
          data.push(['Total', ...filteredCats.map((c: any) => c.totalAmount), gt, '', '']);
        } else {
          data.push(['', ...activePeople.map((p: any) => `${p.emoji} ${p.name}`), 'Total']);
          for (const c of filteredCats) {
            const marks = activePeople.map((p: any) => isAssigned(p, c) ? '\u2713' : '');
            data.push([c.name, ...marks, c.totalAmount]);
          }
          data.push(['Owes', ...activePeople.map((p: any) => parseFloat(p.totalOwed.toFixed(2))), gt]);
          data.push(['Paid', ...activePeople.map((p: any) => parseFloat(p.totalPaid.toFixed(2))), '']);
          data.push(['Balance', ...activePeople.map((p: any) => parseFloat(p.balance.toFixed(2))), '']);
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Expense Summary');
      },
      categories: () => {
        const summaryData: any[][] = [['Category', 'Total', 'Items', 'People', 'Per Person']];
        let grandTotal = 0;
        for (const cat of filteredCats) {
          const assigned = getAssigned(cat, gathering.participants);
          const pp = assigned.length > 0 ? cat.totalAmount / assigned.length : 0;
          summaryData.push([cat.name, cat.totalAmount, cat.sources?.length ?? 0, assigned.length, parseFloat(pp.toFixed(2))]);
          grandTotal += cat.totalAmount;
        }
        summaryData.push(['Total', grandTotal, '', '', '']);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Categories');
      },
      balanceSummary: () => {
        const breakdownData: any[][] = [['Participant', 'Total Owed', 'Total Paid', 'Balance']];
        for (const p of filteredPeople) {
          breakdownData.push([`${p.emoji} ${p.name}`, parseFloat(p.totalOwed.toFixed(2)), parseFloat(p.totalPaid.toFixed(2)), parseFloat(p.balance.toFixed(2))]);
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(breakdownData), 'Balance Summary');
      },
      settlement: () => {
        if (!settlement?.transactions?.length) return;
        const txs = filterPeople && filterPeople.length > 0
          ? settlement.transactions.filter((tx: any) => filterPeople.includes(tx.fromParticipantId) || filterPeople.includes(tx.toParticipantId))
          : settlement.transactions;
        if (txs.length > 0) {
          const settleData: any[][] = [['From', 'To', 'Amount']];
          for (const tx of txs) {
            const from = gathering.participants.find((p: any) => p.id === tx.fromParticipantId)?.name || 'Unknown';
            const to = gathering.participants.find((p: any) => p.id === tx.toParticipantId)?.name || 'Unknown';
            settleData.push([from, to, tx.amount]);
          }
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settleData), 'Settlement');
        }
      },
      categoryDetails: () => {
        const detailData: any[][] = hideAdj
          ? [['Category', 'Participant', 'Share']]
          : [['Category', 'Participant', 'Base Share', 'Adjustment', 'Final Share']];
        for (const cat of filteredCats) {
          const assigned = getAssigned(cat, gathering.participants);
          const filteredAssigned = filterPeople && filterPeople.length > 0
            ? assigned.filter((p: any) => filterPeople.includes(p.id))
            : assigned;
          const baseShare = assigned.length > 0 ? cat.totalAmount / assigned.length : 0;
          const shares = allShares[cat.id] ?? {};
          for (const p of filteredAssigned) {
            const si = shares[p.id];
            if (hideAdj) {
              detailData.push([cat.name, `${p.emoji || ''} ${p.name}`, parseFloat((si?.share ?? baseShare).toFixed(2))]);
            } else {
              detailData.push([cat.name, `${p.emoji || ''} ${p.name}`, parseFloat(baseShare.toFixed(2)), si?.adjLabel ?? '', parseFloat((si?.share ?? baseShare).toFixed(2))]);
            }
          }
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailData), 'Category Details');

        const hasAnySources = filteredCats.some((c: any) => c.sources?.length > 0);
        if (hasAnySources) {
          const sourceData: any[][] = [['Category', 'Item', 'Amount', 'Note']];
          for (const cat of filteredCats) {
            for (const s of cat.sources ?? []) sourceData.push([cat.name, s.name, s.amount, s.note || '']);
          }
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sourceData), 'Source Breakdown');
        }
      },
      individualBreakdown: () => {
        const breakdownData: any[][] = [['Participant', 'Total Owed', 'Total Paid', 'Balance']];
        for (const p of filteredPeople) {
          breakdownData.push([`${p.emoji} ${p.name}`, parseFloat(p.totalOwed.toFixed(2)), parseFloat(p.totalPaid.toFixed(2)), parseFloat(p.balance.toFixed(2))]);
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(breakdownData), 'Breakdown');
      },
      payments: () => {
        if (!gathering.payments?.length) return;
        const payData: any[][] = [['Participant', 'Category', 'Amount', 'Note', 'Date']];
        for (const pay of gathering.payments) {
          if (filterPeople && filterPeople.length > 0 && !filterPeople.includes(pay.participantId)) continue;
          if (filterCategories && filterCategories.length > 0 && pay.categoryId && !filterCategories.includes(pay.categoryId)) continue;
          const pName = gathering.participants.find((p: any) => p.id === pay.participantId)?.name || 'Unknown';
          const catName = pay.categoryId ? gathering.categories.find((c: any) => c.id === pay.categoryId)?.name || '' : 'Overall';
          payData.push([pName, catName, pay.amount, pay.note || '', new Date(pay.createdAt).toLocaleDateString()]);
        }
        if (payData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payData), 'Payments');
      },
    };

    for (const key of sectionOrder) {
      if (sections[key]) excelSections[key]();
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, `${safeName(gathering.name)}_export.xlsx`);
  });

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const newGathering = await fetchApi('/gatherings/import', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      navigate(`/gathering/${newGathering.id}`);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Failed to import. Please check the file format.');
    } finally {
      setImporting(false);
    }
  };

  const [customOpen, setCustomOpen] = useSessionState(`${sk}:customOpen`, false);

  const exportItems = [
    {
      icon: FileText,
      title: 'PDF Invoice',
      description: 'Printable multi-page invoice.',
      action: handleExportPdf,
    },
    {
      icon: FileSpreadsheet,
      title: 'Excel Workbook',
      description: 'Multi-sheet spreadsheet.',
      action: handleExportExcel,
    },
    {
      icon: FileDown,
      title: 'CSV',
      description: 'Simple comma-separated file.',
      action: handleExportCsv,
    },
    {
      icon: FileJson,
      title: 'JSON Data',
      description: 'Full data for reimport.',
      action: handleExportJson,
    },
  ];

  // Matrix warning
  const matrixWarning = sections.expenseSummary && (() => {
    const pCount = gathering.participants.filter((p: any) =>
      gathering.categories.some((c: any) =>
        c.participants?.some((cp: any) => cp.participantId === p.id) ||
        p.categoryAssignments?.some((a: any) => gathering.categories.some((gc: any) => gc.id === a.categoryId))
      ) || gathering.payments?.some((pay: any) => pay.participantId === p.id)
    ).length;
    const cCount = gathering.categories.length;
    const colCount = Math.min(pCount, cCount);
    if (colCount > 12) return { pCount, cCount };
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* ─── Export & Import ─── */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Export</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Download this gathering's data.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {exportItems.map((item) => (
            <button
              key={item.title}
              onClick={item.action}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer text-center"
            >
              <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                <item.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.title}</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Importing...' : 'Import JSON'}
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500">Creates a new gathering from an exported JSON file.</p>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {/* ─── Customisation (collapsible) ─── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setCustomOpen(!customOpen)}
          className="w-full flex items-center justify-between p-6 cursor-pointer text-left"
        >
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Customisation</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sections, order, filters, and PDF options.</p>
          </div>
          <ChevronDown className={cn('w-5 h-5 text-gray-400 transition-transform', customOpen && 'rotate-180')} />
        </button>

        {customOpen && (
          <div className="px-6 pb-6 space-y-6">
            {/* Sections & order */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sections & order</p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">Select all</button>
                  <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                  <button onClick={deselectAll} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">Deselect all</button>
                  <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                  <button onClick={resetOrder} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">Reset order</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Drag to reorder. Applies to PDF, CSV, and Excel.</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {sectionOrder.map((key) => (
                      <SortableSectionItem
                        key={key}
                        id={key}
                        label={SECTION_LABELS[key]}
                        checked={sections[key]}
                        onToggle={() => toggleSection(key)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {matrixWarning && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The expense summary matrix has {matrixWarning.pCount} participants and {matrixWarning.cCount} categories. It may be too wide for one PDF page. Consider using filters below.
                  </p>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Leave empty to include all.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">People</p>
                    <div className="flex gap-2">
                      <button onClick={() => setFilterPeople(null)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">All</button>
                      <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                      <button onClick={() => setFilterPeople([])} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">None</button>
                    </div>
                  </div>
                  <div className="relative rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30">
                    <div className="max-h-48 overflow-y-auto space-y-0.5 p-2 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
                      {gathering.participants.map((p: any) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white dark:hover:bg-gray-600/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={filterPeople === null || filterPeople.includes(p.id)}
                            onChange={() => {
                              if (filterPeople === null) {
                                setFilterPeople(gathering.participants.filter((pt: any) => pt.id !== p.id).map((pt: any) => pt.id));
                              } else if (filterPeople.includes(p.id)) {
                                setFilterPeople(filterPeople.filter(id => id !== p.id));
                              } else {
                                const next = [...filterPeople, p.id];
                                setFilterPeople(next.length === gathering.participants.length ? null : next);
                              }
                            }}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{p.emoji} {p.name}</span>
                        </label>
                      ))}
                    </div>
                    {gathering.participants.length > 5 && (
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 rounded-b-lg bg-gradient-to-t from-gray-50/90 dark:from-gray-700/60 to-transparent" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    {filterPeople === null
                      ? `All ${gathering.participants.length} selected`
                      : `${filterPeople.length} of ${gathering.participants.length} selected`}
                    {gathering.participants.length > 5 && ' · Scroll for more'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Categories</p>
                    <div className="flex gap-2">
                      <button onClick={() => setFilterCategories(null)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">All</button>
                      <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                      <button onClick={() => setFilterCategories([])} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">None</button>
                    </div>
                  </div>
                  <div className="relative rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30">
                    <div className="max-h-48 overflow-y-auto space-y-0.5 p-2 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
                      {gathering.categories.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white dark:hover:bg-gray-600/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={filterCategories === null || filterCategories.includes(c.id)}
                            onChange={() => {
                              if (filterCategories === null) {
                                setFilterCategories(gathering.categories.filter((ct: any) => ct.id !== c.id).map((ct: any) => ct.id));
                              } else if (filterCategories.includes(c.id)) {
                                setFilterCategories(filterCategories.filter(id => id !== c.id));
                              } else {
                                const next = [...filterCategories, c.id];
                                setFilterCategories(next.length === gathering.categories.length ? null : next);
                              }
                            }}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                        </label>
                      ))}
                    </div>
                    {gathering.categories.length > 5 && (
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 rounded-b-lg bg-gradient-to-t from-gray-50/90 dark:from-gray-700/60 to-transparent" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    {filterCategories === null
                      ? `All ${gathering.categories.length} selected`
                      : `${filterCategories.length} of ${gathering.categories.length} selected`}
                    {gathering.categories.length > 5 && ' · Scroll for more'}
                  </p>
                </div>
              </div>
            </div>

            {/* Adjustment style */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Adjustments in export</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'separate-line' as const, label: 'Show as separate line' },
                  { value: 'per-category' as const, label: 'Spread into each category' },
                  { value: 'hidden' as const, label: 'Hide all adjustments' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setOverallAdjStyle(value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
                      overallAdjStyle === value
                        ? value === 'hidden'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium'
                          : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {overallAdjStyle === 'separate-line'
                  ? 'Category shares stay clean. Overall adjustment shown as a separate line in the individual breakdown.'
                  : overallAdjStyle === 'per-category'
                    ? 'Overall adjustment is distributed proportionally into each category share so they add up exactly.'
                    : 'All adjustment details are hidden. Final amounts are shown without revealing that adjustments were applied.'}
              </p>
            </div>

            {/* Category detail options */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category detail pages</p>
              <div className="flex flex-col gap-1">
                {(() => {
                  const allOn = categoryMeta.participantCount && categoryMeta.basePerPerson && categoryMeta.sourceBreakdown;
                  const anyOn = categoryMeta.participantCount || categoryMeta.basePerPerson || categoryMeta.sourceBreakdown;
                  return (
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = anyOn && !allOn; }}
                        onChange={() => {
                          const next = !allOn;
                          setCategoryMeta({ participantCount: next, basePerPerson: next, sourceBreakdown: next });
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Show category metadata</span>
                    </label>
                  );
                })()}
                <div className="ml-8 flex flex-col gap-1">
                  {([
                    { key: 'participantCount' as const, label: 'Participant count' },
                    { key: 'basePerPerson' as const, label: 'Base per person' },
                    { key: 'sourceBreakdown' as const, label: 'Source breakdown' },
                  ]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={categoryMeta[key]}
                        onChange={() => setCategoryMeta(prev => ({ ...prev, [key]: !prev[key] }))}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors mt-1">
                  <input
                    type="checkbox"
                    checked={hideEmptyCategories}
                    onChange={() => setHideEmptyCategories(!hideEmptyCategories)}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Hide categories with no participants</span>
                </label>
              </div>
            </div>

            {/* PDF Footer */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PDF footer</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {([
                  { key: 'appName' as const, label: `App name (${appName})` },
                  { key: 'date' as const, label: 'Date & time' },
                  { key: 'pageNumbers' as const, label: 'Page numbers' },
                  { key: 'gatheringName' as const, label: 'Gathering name' },
                ]).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={footerOpts[key]}
                      onChange={() => setFooterOpts(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
