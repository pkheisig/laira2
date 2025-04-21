import pytest

from src.core.text_processing.chunking_strategies.layout_strategy import chunk_layout, LayoutBlock
from src.core.text_processing.text_chunker import TextChunker

class DummyBlock(LayoutBlock):
    pass

@ pytest.fixture(autouse=True)
def patch_pdf_parser(monkeypatch):
    # Default dummy blocks for tests, can override in test
    blocks = []
    monkeypatch.setattr(
        'src.core.text_processing.chunking_strategies.layout_strategy.parse_pdf_to_layout_blocks',
        lambda pdf_path: blocks
    )
    return blocks


def test_chunk_layout_two_sections(monkeypatch):
    # Prepare dummy blocks: two sections with one paragraph each
    from src.core.text_processing.chunking_strategies.layout_strategy import parse_pdf_to_layout_blocks
    blocks = [
        LayoutBlock(text="Introduction", page=1, bbox=(0,0,0,0), block_type='heading'),
        LayoutBlock(text="First paragraph.", page=1, bbox=(0,0,0,0), block_type='paragraph'),
        LayoutBlock(text="Results", page=1, bbox=(0,0,0,0), block_type='heading'),
        LayoutBlock(text="Second paragraph.", page=1, bbox=(0,0,0,0), block_type='paragraph'),
    ]
    monkeypatch.setitem(globals(), 'blocks', blocks)
    monkeypatch.setattr(
        'src.core.text_processing.chunking_strategies.layout_strategy.parse_pdf_to_layout_blocks',
        lambda pdf: blocks
    )
    # Use default heading patterns
    patterns = TextChunker().section_heading_patterns
    chunks = chunk_layout('dummy', patterns, paragraph_separator='\n\n', max_paragraph_length=1000, overlap_chars=50)
    # Expect two chunks for two sections
    assert len(chunks) == 2
    assert chunks[0].metadata['section'] == 'Introduction'
    assert 'First paragraph.' in chunks[0].text
    assert chunks[1].metadata['section'] == 'Results'
    assert 'Second paragraph.' in chunks[1].text
    assert all(c.metadata['chunk_strategy'] == 'layout' for c in chunks)


def test_chunk_layout_empty_blocks(monkeypatch):
    # No blocks => fallback to paragraph
    monkeypatch.setattr(
        'src.core.text_processing.chunking_strategies.layout_strategy.parse_pdf_to_layout_blocks',
        lambda pdf: []
    )
    tc = TextChunker()
    # Simple text with two paragraphs
    text = "Line1\n\nLine2"
    chunks = tc.chunk_by_layout(text, {'pdf_path': 'dummy'})
    assert len(chunks) == 2
    assert chunks[0].metadata['chunk_strategy'] == 'paragraph'
    assert "Line1" in chunks[0].text
    assert "Line2" in chunks[1].text 