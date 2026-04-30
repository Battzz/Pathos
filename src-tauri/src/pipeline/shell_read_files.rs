pub fn shell_read_file_paths(command: &str) -> Vec<String> {
    let inner = unwrap_shell(command);
    if inner.contains('>') {
        return Vec::new();
    }

    let mut paths = Vec::new();
    for segment in inner.split("&&").flat_map(|part| part.split(';')) {
        let first_pipeline = segment.split('|').next().unwrap_or("").trim();
        if first_pipeline.is_empty() {
            continue;
        }
        let tokens = shell_tokens(first_pipeline);
        let Some(command_index) = tokens
            .iter()
            .position(|token| !token.contains('=') || token.starts_with('-'))
        else {
            continue;
        };
        let command_name = tokens[command_index]
            .rsplit('/')
            .next()
            .unwrap_or(&tokens[command_index]);
        if !matches!(
            command_name,
            "cat" | "head" | "tail" | "nl" | "less" | "more" | "bat" | "tac" | "sed"
        ) {
            continue;
        }

        let mut positional = Vec::new();
        let mut index = command_index + 1;
        while index < tokens.len() {
            let token = &tokens[index];
            if matches!(
                token.as_str(),
                "--lines" | "-c" | "--bytes" | "-s" | "--style" | "--theme" | "--language"
            ) || (command_name != "sed" && token == "-n")
            {
                index += 2;
                continue;
            }
            if token == "--" || token.starts_with('-') {
                index += 1;
                continue;
            }
            positional.push(token.clone());
            index += 1;
        }

        let path_candidates: Vec<String> = if command_name == "sed" {
            positional.into_iter().skip(1).collect()
        } else {
            positional
        };
        for path in path_candidates
            .into_iter()
            .filter(|path| looks_like_path(path))
        {
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    paths
}

pub fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty())
        .unwrap_or(path)
}

fn unwrap_shell(command: &str) -> &str {
    let trimmed = command.trim();
    let first_end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
    let base = trimmed[..first_end]
        .rsplit('/')
        .next()
        .unwrap_or(&trimmed[..first_end]);
    if !matches!(base, "sh" | "bash" | "zsh" | "fish" | "dash") {
        return trimmed;
    }

    let mut rest = trimmed[first_end..].trim_start();
    while rest.starts_with('-') {
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        rest = rest[end..].trim_start();
    }

    let bytes = rest.as_bytes();
    if bytes.len() >= 2 {
        let (first, last) = (bytes[0], bytes[bytes.len() - 1]);
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return &rest[1..rest.len() - 1];
        }
    }
    rest
}

fn shell_tokens(command: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = command.chars().peekable();

    while let Some(ch) = chars.next() {
        if let Some(quote_char) = quote {
            if ch == '\\' && quote_char == '"' {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            } else if ch == quote_char {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }

        if ch == '\'' || ch == '"' {
            quote = Some(ch);
        } else if ch.is_whitespace() {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        } else if ch == '\\' {
            if let Some(next) = chars.next() {
                current.push(next);
            }
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn looks_like_path(token: &str) -> bool {
    if token.is_empty() || token == "-" {
        return false;
    }
    token.contains('/') || token.contains('.') || token.starts_with('~') || token.starts_with('$')
}
