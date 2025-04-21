from dataclasses import dataclass
from typing import Tuple, Literal, List, Pattern, Optional
import pdfplumber
import re

@dataclass
class LayoutBlock:
    text: str
    page: int
    bbox: Tuple[float, float, float, float]
    block_type: Literal['heading', 'paragraph', 'figure', 'table', 'caption']


def parse_pdf_to_layout_blocks(pdf_path: str) -> List[LayoutBlock]:
    """
    Parse a PDF at `pdf_path` into a sequence of LayoutBlocks capturing text, page number,
    bounding-box, and block_type metadata (headings, paragraphs, figures, tables, etc.).

    TODO: Implement extraction logic using pdfplumber or PyMuPDF.
    """
    # Example outline:
    # with pdfplumber.open(pdf_path) as pdf:
    #     for page_number, page in enumerate(pdf.pages, start=1):
    #         for block in page.extract_words(use_text_flow=True):
    #             # Determine block_type via patterns on block['text'] or font-size
    #             lb = LayoutBlock(text=block['text'], page=page_number, bbox=block['bbox'], block_type='paragraph')
    #             yield lb
    raise NotImplementedError("PDF layout parsing not yet implemented")

@dataclass
class Section:
    """
    Represents a logical section in a document with a title and associated blocks.
    """
    title: str
    blocks: List[LayoutBlock]

def chunk_layout(
    pdf_path: str,
    heading_patterns: List[Pattern],
    paragraph_separator: str = "\n\n",
    max_paragraph_length: int = 1000,
    overlap_chars: int = 200
) -> List['TextChunk']:
    """
    Perform layout-aware chunking: group blocks into sections, chunk paragraphs within each section,
    and bridge sections with overlap.
    """
    # Dynamic imports to avoid circular dependencies
    from src.core.text_processing.text_chunker import TextChunker, TextChunk

    # Parse PDF into layout blocks
    blocks = list(parse_pdf_to_layout_blocks(pdf_path))
    # Group blocks into sections based on headings
    sections: List[Section] = []
    for lb in blocks:
        if any(pat.match(lb.text) for pat in heading_patterns):
            sections.append(Section(title=lb.text.strip(), blocks=[]))
        else:
            if not sections:
                sections.append(Section(title="Introduction", blocks=[]))
            sections[-1].blocks.append(lb)

    all_chunks: List[TextChunk] = []
    prev_text: Optional[str] = None
    for section in sections:
        # Combine paragraph/caption blocks
        texts = [b.text for b in section.blocks if b.block_type in ('paragraph', 'caption')]
        section_text = paragraph_separator.join(texts)
        # Context bridging: prepend overlap of previous section
        if prev_text:
            overlap_text = prev_text[-overlap_chars:]
            section_text = overlap_text + paragraph_separator + section_text

        # Chunk within section by paragraphs
        chunker = TextChunker({
            'chunk_size': max_paragraph_length
        })
        sec_chunks = chunker.chunk_by_paragraph(section_text, {'section': section.title})
        # Annotate and collect
        for idx, chunk in enumerate(sec_chunks):
            chunk.metadata.update({
                'section': section.title,
                'section_index': idx,
                'chunk_strategy': 'layout'
            })
            all_chunks.append(chunk)
        prev_text = section_text

    return all_chunks 