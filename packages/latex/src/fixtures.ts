/**
 * Test fixtures for @coach/latex. Kept in a `.ts` module (not a `.tex` asset) so
 * the pure package needs no `fs` access at test time — honouring the no-I/O rule.
 */

/** A small but representative paper skeleton: abstract, sections, equation,
 *  figure, cite, inline math, a comment, and text-formatting wrappers. */
export const SAMPLE_TEX = String.raw`\documentclass{article}
\usepackage{amsmath}
\title{A Tiny Paper}
\author{A. Researcher}

\begin{document}
\maketitle

\begin{abstract}
We study \emph{identifiability} of latent variables. % a trailing comment here
Our estimator achieves error $\epsilon$ on the benchmark of \citet{smith2020}.
\end{abstract}

\section{Introduction}
Representation learning seeks compact codes. Prior work~\citep{jones2019} is broad,
but the \textbf{key} gap is identifiability. We close it. The 50\% threshold matters.

Consider the loss
\begin{equation}
  \mathcal{L}(\theta) = \sum_{i=1}^N \| f_\theta(x_i) - y_i \|^2 .
  \label{eq:loss}
\end{equation}
Minimizing \cref{eq:loss} recovers the signal, as shown in \cref{fig:arch}.

\begin{figure}[t]
  \centering
  \includegraphics[width=0.5\textwidth]{arch.pdf}
  \caption{The architecture. This caption should be dropped entirely.}
  \label{fig:arch}
\end{figure}

\subsection{Related Work}
Many methods exist \cite{a,b,c}. None proves identifiability with a guarantee.

\section{Discussion}
Our bound is sufficient but we do not claim it is necessary.
\end{document}
`;

/** A degenerate input that is essentially all math/markup — exercises low proseRatio. */
export const MATH_HEAVY_TEX = String.raw`\section{Proof}
\begin{align}
  a &= b + c \\
  d &= e - f .
\end{align}
\begin{equation}
  g = h \cdot k .
\end{equation}
`;
