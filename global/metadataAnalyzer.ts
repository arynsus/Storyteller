import ChineseNumber from 'chinese-numbers-converter';

export const analyzeMetadata = (filename: string) => {
    const metadata = {
        bookTitle: '',
        chapterTitle: '',
        chapterNumber: '', // Should be a string of number
        author: '',
        coverArt: ''
    };

    const convertChineseToArabic = (chineseNum: string) => {
        try {
            return new ChineseNumber(chineseNum).toArabicString();
        } catch (error) {
            console.error('Error converting Chinese numeral:', error);
            return '';
        }
    };

    // Define patterns for chapter number and title extraction
    const patterns = [
        { // Example: 第一卷 第十一章 XXXXXXXX
            regex: /第(\S+)卷\s+第(\S+)章\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: convertChineseToArabic(match[1]) + '.' + convertChineseToArabic(match[2]),
                chapterTitle: match[3]
            })
        },
        { // Example: 第一卷 十一章 XXXXXXXX
            regex: /第(\S+)卷\s+(\S+)章\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: convertChineseToArabic(match[1]) + '.' + convertChineseToArabic(match[2]),
                chapterTitle: match[3]
            })
        },
        { // Example: 一卷 十一章 XXXXXXXX
            regex: /(\S+)卷\s+(\S+)章\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: convertChineseToArabic(match[1]) + '.' + convertChineseToArabic(match[2]),
                chapterTitle: match[3]
            })
        },
        { // Example: 第1卷 11章 XXXXXXXX
            regex: /第(\d+)卷\s+(\d+)章\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1] + '.' + match[2],
                chapterTitle: match[3]
            })
        },
        { // Example: 第1卷 第11章 XXXXXXXX
            regex: /第(\d+)卷\s+第(\d+)章\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1] + '.' + match[2],
                chapterTitle: match[3]
            })
        },
        { // Example: Volume 1 Chapter 11 XXXXXXXX
            regex: /Volume\s+(\d+)\s+Chapter\s+(\d+)\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1] + '.' + match[2],
                chapterTitle: match[3]
            })
        },
        { // Example: Volume 1 Chapter 11: XXXXXXXX
            regex: /Volume\s+(\d+)\s+Chapter\s+(\d+):\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1] + '.' + match[2],
                chapterTitle: match[3]
            })
        },
        { // Example: Volume 1 - Chapter 11 - XXXXXXXX
            regex: /Volume\s+(\d+)\s+-\s+Chapter\s+(\d+)\s+-\s+(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1] + '.' + match[2],
                chapterTitle: match[3]
            })
        },
        { // Example: 1.11 - XXXXXXXX
            regex: /(\d+\.\d+)\s*-\s*(.+)/,
            extract: (match: RegExpMatchArray) => ({
                chapterNumber: match[1],
                chapterTitle: match[2]
            })
        },
        // Add more patterns here
        // ...
    ];

    // Iterate over each pattern to find a match
    for (const pattern of patterns) {
        const match = filename.slice(0,-4).match(pattern.regex);
        if (match) {
            const { chapterNumber, chapterTitle } = pattern.extract(match);
            metadata.chapterNumber = chapterNumber;
            metadata.chapterTitle = chapterTitle;
            break; // Exit loop once a match is found
        }
    }

    return metadata;
};
