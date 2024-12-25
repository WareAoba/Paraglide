// components/Views/Console.js
import React, { useState, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import '../../CSS/Controllers/Simplebar.css';  // 커스텀 스타일만 import
import '../../CSS/Views/Console.css';

const { ipcRenderer } = window.require('electron');

const theme = 'dark';

const Console = () => {
    const [logs, setLogs] = useState([]);
    const consoleRef = useRef(null);

    useEffect(() => {
        ipcRenderer.invoke('get-logs').then(initialLogs => {
            setLogs(initialLogs);
        });

        const handleNewLogs = (_, newLogs) => {
            setLogs(newLogs);
            // SimpleBar의 scrollIntoView 사용
            if (consoleRef.current) {
                const scrollEl = consoleRef.current.getScrollElement();
                scrollEl.scrollTop = scrollEl.scrollHeight;
            }
        };

        ipcRenderer.on('update-logs', handleNewLogs);
        return () => {
            ipcRenderer.removeListener('update-logs', handleNewLogs);
        };
    }, []);

    const highlightPatterns = {
        // 성공 패턴 (하늘색)
        success: [
            '완료',
            '로그 저장됨',
            '성공',
            '복사됨',
            'Process'
        ],
        // 통과 패턴 (연두색)
        pass: [
            '[SystemListener]',
            '[단축키]',
            '테스트 통과',
            '초기화',
            'Ready'
        ],
        // 주의 패턴 (노란색)
        warning: [
            '변경 감지',
            '외부 복사 감지',
            '[클립보드]',
            '[Main]'
        ],
        // 실패 패턴 (빨간색)
        error: [
            '실패',
            '오류',
            '에러'
        ]
    };

    const highlightText = (text) => {
        // 모든 패턴을 포함하는 정규식 생성
        const patterns = Object.entries(highlightPatterns).reduce((acc, [type, words]) => {
            words.forEach(word => {
                acc.push({
                    pattern: word,
                    type: type
                });
            });
            return acc;
        }, []);

        // 가장 긴 패턴부터 매칭하도록 정렬
        patterns.sort((a, b) => b.pattern.length - a.pattern.length);

        // 정규식 패턴 생성
        const regex = new RegExp(
            `(${patterns.map(p => p.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
            'g'
        );

        const parts = text.split(regex);
        
        return parts.map((part, i) => {
            const matchedPattern = patterns.find(p => p.pattern === part);
            if (matchedPattern) {
                return (
                    <span key={i} className={`log-highlight log-${matchedPattern.type}`}>
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    return (
        <div className="console-container">
            <div className="console-header">
                <div className="console-title">Terminal Logs ({logs.length})</div>
                <button className="console-close" onClick={() => window.close()}>×</button>
            </div>
            <SimpleBar className="console-content" ref={consoleRef} data-theme={theme}>
                {logs.map((log, index) => (
                    <div key={index} className={`log-entry ${log.type}`}>
                        <span className="timestamp">
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                        </span>
                        <span className="content">{highlightText(log.content)}</span>
                    </div>
                ))}
                {logs.length === 0 && (
                    <div className="no-logs">로그가 없습니다.</div>
                )}
            </SimpleBar>
        </div>
    );
};

export default Console;