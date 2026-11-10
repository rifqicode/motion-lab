import React, {memo} from 'react';
import type {SourceFile} from './types.js';

export interface SourceViewerProps {
  before: SourceFile[];
  after: SourceFile[];
  compare: boolean;
}

export const SourceViewer = memo(function SourceViewer({before, after, compare}: SourceViewerProps) {
  const paths = [...new Set([...before.map(file => file.path), ...after.map(file => file.path)])];
  return (
    <div className="source-viewer">
      {paths.map(path => {
        const oldFile = before.find(file => file.path === path);
        const newFile = after.find(file => file.path === path);
        const changed = oldFile?.content !== newFile?.content;
        return (
          <details key={path} open={paths.length === 1}>
            <summary>
              {path}
              {compare && (
                <span>{!newFile ? 'Dihapus' : !oldFile ? 'Baru' : changed ? 'Diubah' : 'Tetap'}</span>
              )}
            </summary>
            {compare && oldFile && changed && (
              <>
                <h3>Sebelum</h3>
                <pre tabIndex={0}><code>{oldFile.content}</code></pre>
              </>
            )}
            {newFile && (
              <>
                {compare && <h3>{changed ? 'Sesudah' : 'Source tetap'}</h3>}
                <pre tabIndex={0}><code>{newFile.content}</code></pre>
              </>
            )}
          </details>
        );
      })}
    </div>
  );
});
