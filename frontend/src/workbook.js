import { strToU8, zipSync } from 'fflate'

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const escapeXml = (value) => String(value ?? '')
  // oxlint-disable-next-line no-control-regex -- Excel XML cannot contain these control bytes.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

function columnName(number) {
  let name = ''
  while (number > 0) {
    number -= 1
    name = String.fromCharCode(65 + number % 26) + name
    number = Math.floor(number / 26)
  }
  return name
}

function cellXml(value, reference, style = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`
  }
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function worksheetXml({ title, headers, rows }) {
  const columns = Math.max(1, headers.length)
  const allRows = [[title], headers, ...rows]
  const lastColumn = columnName(columns)
  const lastRow = Math.max(2, allRows.length)
  const content = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      cellXml(value, `${columnName(columnIndex + 1)}${rowIndex + 1}`, rowIndex === 0 ? 1 : rowIndex === 1 ? 2 : 0)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const widths = headers.map((header, index) => {
    const longest = Math.max(12, String(header).length + 2, ...rows.map((row) => String(row[index] ?? '').split('\n')[0].length + 2))
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, longest)}" customWidth="1"/>`
  }).join('')
  const merge = columns > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>` : ''
  const hasTable = rows.length > 0
  const tableParts = hasTable ? `<tableParts count="1"><tablePart r:id="rId1"/></tableParts>` : ''
  const autoFilter = hasTable ? '' : `<autoFilter ref="A2:${lastColumn}${lastRow}"/>`
  const relsNamespace = hasTable ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' : ''
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${relsNamespace}><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths}</cols><sheetData>${content}</sheetData>${merge}${autoFilter}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>${tableParts}</worksheet>`
}

function tableXml({ headers, rows }, tableId) {
  const lastColumn = columnName(headers.length)
  const range = `A2:${lastColumn}${rows.length + 2}`
  const columns = headers.map((header, index) => `<tableColumn id="${index + 1}" name="${escapeXml(header)}"/>`).join('')
  return `${XML_HEADER}<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableId}" name="ClinicTable${tableId}" displayName="ClinicTable${tableId}" ref="${range}" totalsRowShown="0"><autoFilter ref="${range}"/><tableColumns count="${headers.length}">${columns}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`
}

const stylesXml = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183447"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF267B91"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

export function buildWorkbook(sheets) {
  const names = sheets.map((sheet) => sheet.name)
  if (new Set(names).size !== names.length || names.some((name) => !name || name.length > 31 || /[\\/*?:[\]]/.test(name))) {
    throw new Error('Workbook sheet names must be unique, valid Excel names.')
  }
  const sheetRefs = sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetRefs}</sheets><calcPr calcId="191029"/></workbook>`
  const workbookRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const contentSheets = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const contentTables = sheets.map((sheet, index) => sheet.rows.length ? `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>` : '').join('')
  const files = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentSheets}${contentTables}</Types>`,
    '_rels/.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': stylesXml,
  }
  sheets.forEach((sheet, index) => {
    const sheetId = index + 1
    files[`xl/worksheets/sheet${sheetId}.xml`] = worksheetXml(sheet)
    if (sheet.rows.length) {
      files[`xl/worksheets/_rels/sheet${sheetId}.xml.rels`] = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${sheetId}.xml"/></Relationships>`
      files[`xl/tables/table${sheetId}.xml`] = tableXml(sheet, sheetId)
    }
  })
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])), { level: 6 })
}
