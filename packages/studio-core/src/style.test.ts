import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {ProjectSchema, StyleBriefSchema, briefHash, serializeBrief, STYLE_BRIEF_KEYS} from './index.js';

const emptyStyle = {mood: '', colorPalette: '', typography: '', pacing: '', transitions: '', visualDirection: '', referenceNotes: '', avoid: ''};

describe('project style contract and creative approval fingerprint', () => {
  it('defaults partial style briefs to eight trimmed string fields', () => {
    expect(StyleBriefSchema.parse({})).toEqual(emptyStyle);
    expect(StyleBriefSchema.parse({mood: '  Warm and conversational\n', referenceNotes: '  Uploaded keyframe notes  '}))
      .toEqual({...emptyStyle, mood: 'Warm and conversational', referenceNotes: 'Uploaded keyframe notes'});
  });

  it('rejects unknown fields and non-string values rather than coercing them', () => {
    expect(() => StyleBriefSchema.parse({lighting: 'soft'})).toThrow();
    for (const mood of [42, null, false, ['calm'], {value: 'calm'}]) expect(() => StyleBriefSchema.parse({mood})).toThrow();
  });

  it('bounds reference notes independently from the other normalized style fields', () => {
    expect(StyleBriefSchema.parse({mood: 'a'.repeat(4000), referenceNotes: 'b'.repeat(8000)}).referenceNotes).toHaveLength(8000);
    expect(() => StyleBriefSchema.parse({mood: 'a'.repeat(4001)})).toThrow();
    expect(() => StyleBriefSchema.parse({referenceNotes: 'b'.repeat(8001)})).toThrow();
    expect(() => StyleBriefSchema.parse({avoid: 'a'.repeat(4001)})).toThrow();
  });

  it('normalizes legacy project files without changing schema version or their old approval', () => {
    const project = ProjectSchema.parse({id: 'legacy-project', name: 'Legacy', fps: 30, width: 720, height: 1280,
      currentRevisionId: null, openCandidateId: null, brief: 'abc', approvedBriefHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z'});
    expect(project.schemaVersion).toBe(1);
    expect(project.style).toEqual(emptyStyle);
    expect(project.approvedBriefHash).toBe(briefHash(project.brief, project.style));
  });

  it('keeps the exact legacy SHA256 for absent, empty or whitespace-only styles', () => {
    const legacy = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(briefHash('  abc\n')).toBe(legacy);
    expect(briefHash('abc', {})).toBe(legacy);
    expect(briefHash('abc', emptyStyle)).toBe(legacy);
    expect(briefHash('abc', {mood: ' \n ', avoid: '\t'})).toBe(legacy);
    expect(serializeBrief(' abc ', emptyStyle)).toBe('abc');
  });

  it('serializes nonempty style keys in canonical alphabetical order and trims all input', () => {
    const expected = '{"brief":"Explain cache.","style":{"avoid":"neon","colorPalette":"cream / ink","visualDirection":"Hand-drawn"}}';
    const style = {visualDirection: '  Hand-drawn  ', colorPalette: ' cream / ink ', mood: '\n ', avoid: ' neon '};
    expect(serializeBrief('  Explain cache.\n', style)).toBe(expected);
    expect(briefHash(' Explain cache. ', style)).toBe(createHash('sha256').update(expected).digest('hex'));
    expect(serializeBrief('Explain cache.', {avoid: 'neon', visualDirection: 'Hand-drawn', colorPalette: 'cream / ink'})).toBe(expected);
  });

  it.each(STYLE_BRIEF_KEYS)('includes %s in approval without depending on object insertion order', key => {
    expect(briefHash('One story.', {[key]: 'Specific creative direction'})).not.toBe(briefHash('One story.'));
    expect(briefHash('One story.', {[key]: ' Specific creative direction '})).toBe(briefHash('One story.', {[key]: 'Specific creative direction'}));
  });
});
